import type { ApiErrorPayload, HomeAssistantConnectionState } from '@home-control/shared';
import { HomeAssistantError } from './errors.js';
import type { HassStateChangedEvent, Logger } from './types.js';

export interface WsClientOptions {
  /** Base URL (http/https); converted to ws/wss. */
  baseUrl: string;
  token: string;
  logger: Logger;
  connectTimeoutMs?: number;
  pingIntervalMs?: number;
  pongTimeoutMs?: number;
  backoff?: { initialMs: number; maxMs: number; factor: number };
}

type RealtimeState = Exclude<HomeAssistantConnectionState, 'not_configured'>;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: HomeAssistantError) => void;
  timer: NodeJS.Timeout;
}

const DEFAULT_BACKOFF = { initialMs: 1000, maxMs: 30_000, factor: 2 };

/**
 * Realtime client for the Home Assistant WebSocket API.
 *
 * - Authenticates, then subscribes to `state_changed` events.
 * - Reconnects with exponential backoff + jitter after any interruption and re-subscribes.
 * - Detects half-open connections with ping/pong.
 * - An invalid token is fatal: it does not retry (retrying would only spam Home Assistant).
 * - The token is only ever sent in the auth message and is never logged.
 */
export class HomeAssistantWsClient {
  state: RealtimeState = 'idle';
  reconnectAttempts = 0;
  lastConnectedAt: Date | null = null;
  haVersion: string | null = null;
  lastError: ApiErrorPayload | null = null;

  private socket: WebSocket | null = null;
  private nextId = 1;
  private subscriptionId: number | null = null;
  private readonly pending = new Map<number, Pending>();
  private readonly eventListeners = new Set<(event: HassStateChangedEvent) => void>();
  private readonly connectionListeners = new Set<(state: RealtimeState) => void>();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private connectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private pongTimer: NodeJS.Timeout | null = null;

  private readonly wsUrl: string;
  private readonly connectTimeoutMs: number;
  private readonly pingIntervalMs: number;
  private readonly pongTimeoutMs: number;
  private readonly backoff: { initialMs: number; maxMs: number; factor: number };

  constructor(private readonly options: WsClientOptions) {
    this.wsUrl = `${options.baseUrl.replace(/^http/, 'ws')}/api/websocket`;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 10_000;
    this.pingIntervalMs = options.pingIntervalMs ?? 30_000;
    this.pongTimeoutMs = options.pongTimeoutMs ?? 10_000;
    this.backoff = options.backoff ?? DEFAULT_BACKOFF;
  }

  start(): void {
    if (this.state !== 'idle' && this.state !== 'stopped' && this.state !== 'failed') return;
    this.lastError = null;
    this.connect();
  }

  stop(): void {
    this.setState('stopped');
    this.clearTimers();
    this.rejectPending('disconnected', 'Realtime client stopped');
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  /** Subscribes to state changes. Returns an unsubscribe function. */
  onStateChanged(listener: (event: HassStateChangedEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  /** Notified on every connection state change (e.g. to resync via REST after reconnecting). */
  onConnectionChange(listener: (state: RealtimeState) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  /** Sends a command (e.g. `get_states`) and resolves with its result. */
  sendCommand<T = unknown>(
    type: string,
    payload: Record<string, unknown> = {},
    timeoutMs = 10_000,
  ): Promise<T> {
    if (this.state !== 'connected' || !this.socket) {
      return Promise.reject(
        new HomeAssistantError(
          'disconnected',
          'Realtime connection to Home Assistant is not established',
        ),
      );
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new HomeAssistantError('timeout', `Home Assistant did not answer "${type}" in time`),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.send({ id, type, ...payload });
    });
  }

  // --- connection lifecycle -------------------------------------------------

  private connect(): void {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.wsUrl);
    } catch (error) {
      this.fail('unreachable', 'Invalid Home Assistant WebSocket URL', error);
      return;
    }
    this.socket = socket;
    this.connectTimer = setTimeout(() => {
      this.options.logger.warn({}, 'home assistant websocket connect/auth timed out');
      this.lastError = { code: 'timeout', message: 'Timed out connecting to Home Assistant' };
      socket.close();
    }, this.connectTimeoutMs);

    // Ignore events from sockets that were already replaced.
    const current = () => this.socket === socket;
    socket.onopen = () => current() && this.setState('authenticating');
    socket.onmessage = (event) => current() && this.handleMessage(String(event.data));
    socket.onerror = () => {
      if (current() && !this.lastError) {
        this.lastError = { code: 'unreachable', message: 'Could not connect to Home Assistant' };
      }
    };
    socket.onclose = () => current() && this.handleClose();
  }

  private handleMessage(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      this.options.logger.warn({}, 'home assistant sent a non-JSON websocket message');
      return;
    }

    switch (message.type) {
      case 'auth_required':
        this.send({ type: 'auth', access_token: this.options.token });
        break;
      case 'auth_ok':
        this.handleAuthOk(message);
        break;
      case 'auth_invalid':
        this.fail('unauthorized', 'Home Assistant rejected the access token');
        break;
      case 'result':
        this.handleResult(message);
        break;
      case 'event':
        this.handleEvent(message);
        break;
      case 'pong':
        this.clearTimer('pongTimer');
        break;
      default:
        this.options.logger.debug({ type: String(message.type) }, 'ignored websocket message');
    }
  }

  private handleAuthOk(message: Record<string, unknown>): void {
    this.clearTimer('connectTimer');
    this.reconnectAttempts = 0;
    this.lastError = null;
    this.lastConnectedAt = new Date();
    this.haVersion = typeof message.ha_version === 'string' ? message.ha_version : null;
    this.setState('connected');

    // Subscriptions do not survive a reconnect: always re-subscribe.
    this.subscriptionId = this.nextId++;
    this.send({ id: this.subscriptionId, type: 'subscribe_events', event_type: 'state_changed' });
    this.startPing();
    this.options.logger.info({ haVersion: this.haVersion }, 'home assistant websocket connected');
  }

  private handleResult(message: Record<string, unknown>): void {
    const id = message.id as number;
    if (id === this.subscriptionId) {
      if (message.success !== true) {
        this.options.logger.error({}, 'state_changed subscription rejected; reconnecting');
        this.socket?.close();
      }
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (message.success === true) {
      pending.resolve(message.result);
    } else {
      pending.reject(
        new HomeAssistantError('upstream_error', 'Home Assistant rejected the command'),
      );
    }
  }

  private handleEvent(message: Record<string, unknown>): void {
    if (message.id !== this.subscriptionId) return;
    const event = message.event as
      { event_type?: string; data?: HassStateChangedEvent } | undefined;
    if (event?.event_type !== 'state_changed' || !event.data) return;
    for (const listener of this.eventListeners) {
      try {
        listener(event.data);
      } catch (error) {
        // A faulty listener must never break the connection.
        this.options.logger.error({ err: String(error) }, 'state listener threw');
      }
    }
  }

  private handleClose(): void {
    this.clearTimers();
    this.socket = null;
    this.subscriptionId = null;
    this.rejectPending('disconnected', 'Connection to Home Assistant was lost');
    if (this.state === 'stopped' || this.state === 'failed') return;

    const delay = this.nextDelay();
    this.reconnectAttempts += 1;
    this.setState('reconnecting');
    this.options.logger.warn(
      { attempt: this.reconnectAttempts, delayMs: Math.round(delay), reason: this.lastError?.code },
      'home assistant websocket closed; scheduling reconnect',
    );
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  /** Fatal failure: no further reconnect attempts until start() is called again. */
  private fail(code: ApiErrorPayload['code'], message: string, cause?: unknown): void {
    this.lastError = { code, message };
    this.clearTimers();
    this.rejectPending('disconnected', message);
    this.setState('failed');
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.options.logger.error(
      { code, cause: cause === undefined ? undefined : String(cause) },
      'home assistant websocket failed permanently',
    );
  }

  /** Exponential backoff with "equal jitter" (between 50% and 100% of the cap). */
  private nextDelay(): number {
    const { initialMs, maxMs, factor } = this.backoff;
    const cap = Math.min(maxMs, initialMs * factor ** this.reconnectAttempts);
    return cap / 2 + Math.random() * (cap / 2);
  }

  // --- keepalive -------------------------------------------------------------

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (this.state !== 'connected') return;
      this.send({ id: this.nextId++, type: 'ping' });
      this.pongTimer ??= setTimeout(() => {
        this.pongTimer = null;
        this.options.logger.warn({}, 'home assistant ping timed out; dropping connection');
        this.lastError = { code: 'timeout', message: 'Home Assistant stopped answering' };
        this.socket?.close();
      }, this.pongTimeoutMs);
    }, this.pingIntervalMs);
  }

  // --- helpers ---------------------------------------------------------------

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  private setState(state: RealtimeState): void {
    if (this.state === state) return;
    this.state = state;
    for (const listener of this.connectionListeners) {
      try {
        listener(state);
      } catch {
        // ignore listener errors
      }
    }
  }

  private rejectPending(code: 'disconnected', message: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new HomeAssistantError(code, message));
      this.pending.delete(id);
    }
  }

  private clearTimer(name: 'connectTimer' | 'pongTimer' | 'pingTimer' | 'reconnectTimer'): void {
    const timer = this[name];
    if (timer) {
      clearTimeout(timer);
      clearInterval(timer);
      this[name] = null;
    }
  }

  private clearTimers(): void {
    for (const name of ['connectTimer', 'pongTimer', 'pingTimer', 'reconnectTimer'] as const) {
      this.clearTimer(name);
    }
  }
}
