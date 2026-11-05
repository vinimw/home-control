import type { ApiErrorPayload, HomeAssistantStatus } from '@home-control/shared';
import type { Observe } from '../diagnostics.js';
import { HomeAssistantError, toErrorPayload } from './errors.js';
import { HomeAssistantRestClient } from './rest-client.js';
import type { HassStateChangedEvent, Logger } from './types.js';
import { HomeAssistantWsClient } from './ws-client.js';

export interface HomeAssistantSettings {
  url: string;
  token: string;
  timeoutMs: number;
}

/** Facade over the REST and realtime clients. Backend-only: it owns the access token. */
export class HomeAssistantService {
  private readonly restClient: HomeAssistantRestClient | null;
  private readonly wsClient: HomeAssistantWsClient | null;

  constructor(settings: HomeAssistantSettings | null, logger: Logger, observe?: Observe) {
    if (!settings) {
      this.restClient = null;
      this.wsClient = null;
      return;
    }
    this.restClient = new HomeAssistantRestClient({
      baseUrl: settings.url,
      token: settings.token,
      timeoutMs: settings.timeoutMs,
      observe,
    });
    this.wsClient = new HomeAssistantWsClient({
      baseUrl: settings.url,
      token: settings.token,
      logger,
      observe,
    });
  }

  get configured(): boolean {
    return this.restClient !== null;
  }

  /** REST client; throws a structured `not_configured` error when HA is not set up. */
  get rest(): HomeAssistantRestClient {
    if (!this.restClient) {
      throw new HomeAssistantError('not_configured', 'Home Assistant is not configured');
    }
    return this.restClient;
  }

  /** Realtime client; throws a structured `not_configured` error when HA is not set up. */
  get realtime(): HomeAssistantWsClient {
    if (!this.wsClient) {
      throw new HomeAssistantError('not_configured', 'Home Assistant is not configured');
    }
    return this.wsClient;
  }

  start(): void {
    this.wsClient?.start();
  }

  stop(): void {
    this.wsClient?.stop();
  }

  onStateChanged(listener: (event: HassStateChangedEvent) => void): () => void {
    return this.realtime.onStateChanged(listener);
  }

  /** Live connectivity probe; rejects with a structured error on failure. */
  ping(): Promise<{ message: string }> {
    return this.rest.getApiStatus();
  }

  async getStatus(): Promise<HomeAssistantStatus> {
    if (!this.restClient || !this.wsClient) {
      return {
        configured: false,
        healthy: false,
        realtime: {
          state: 'not_configured',
          reconnectAttempts: 0,
          lastConnectedAt: null,
          haVersion: null,
          lastError: null,
        },
        rest: { reachable: false, error: null },
      };
    }

    let restError: ApiErrorPayload | null = null;
    try {
      await this.restClient.getApiStatus();
    } catch (error) {
      restError = toErrorPayload(error);
    }

    const ws = this.wsClient;
    return {
      configured: true,
      healthy: restError === null && ws.state === 'connected',
      realtime: {
        state: ws.state,
        reconnectAttempts: ws.reconnectAttempts,
        lastConnectedAt: ws.lastConnectedAt?.toISOString() ?? null,
        haVersion: ws.haVersion,
        lastError: ws.lastError,
      },
      rest: { reachable: restError === null, error: restError },
    };
  }
}
