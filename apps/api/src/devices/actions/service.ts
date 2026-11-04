import { z } from 'zod';
import type { Device, DeviceActionResult } from '@home-control/shared';
import { ApiError, toErrorPayload } from '../../errors.js';
import type { HomeAssistantService } from '../../homeassistant/service.js';
import type { Logger } from '../../homeassistant/types.js';
import type { DeviceRegistry } from '../registry.js';
import { toServiceCall, type AdapterContext } from './adapter.js';
import { expectationFor, type Expectation } from './expectations.js';
import { validateParams } from './params.js';

export interface DeviceActionServiceOptions {
  registry: DeviceRegistry;
  homeAssistant: HomeAssistantService;
  logger: Logger;
  /** How results present the device (e.g. with the user's alias). Defaults to the raw registry view. */
  view?: (deviceId: string) => Device | undefined;
  /** Launchable TV applications (name -> id), from configuration. */
  apps?: ReadonlyMap<string, string>;
  /** Master switch. Off by default until authentication exists. */
  enabled: boolean;
  /** How long to wait for the resulting state before answering `accepted`. */
  confirmTimeoutMs?: number;
  idempotencyTtlMs?: number;
  maxIdempotencyEntries?: number;
}

const bodySchema = z
  .object({
    command: z.string().min(1).max(64),
    params: z.record(z.string(), z.unknown()).optional(),
    requestId: z
      .string()
      .regex(/^[A-Za-z0-9_-]{1,64}$/, { message: 'must be 1-64 characters of A-Z a-z 0-9 _ -' })
      .optional(),
  })
  .strict();

interface IdempotencyEntry {
  fingerprint: string;
  createdAt: number;
  result: Promise<DeviceActionResult>;
}

/** Stable representation of a request, used to detect a reused `requestId` with different content. */
function fingerprintOf(command: string, params: Record<string, unknown>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => [key, params[key]]);
  return JSON.stringify([command, sorted]);
}

/**
 * Executes device actions safely:
 *
 * 1. the client may only send a canonical command from the device's own `commands` list;
 * 2. params are validated against that command's spec (strict: no extra keys);
 * 3. the Home Assistant service is chosen server-side from a fixed table, and the entity comes from the
 *    server-side binding, so a client can never run an arbitrary service or target another entity;
 * 4. the outcome is `confirmed` only when the expected state was actually observed.
 */
export class DeviceActionService {
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly confirmTimeoutMs: number;
  private readonly idempotencyTtlMs: number;
  private readonly maxEntries: number;

  constructor(private readonly options: DeviceActionServiceOptions) {
    this.confirmTimeoutMs = options.confirmTimeoutMs ?? 3000;
    this.idempotencyTtlMs = options.idempotencyTtlMs ?? 60_000;
    this.maxEntries = options.maxIdempotencyEntries ?? 500;
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  /**
   * Throws an {@link ApiError} when the request is rejected before anything runs. Once execution starts,
   * failures are returned as a result with `status: 'failed'` instead of being thrown.
   */
  async execute(deviceId: string, rawBody: unknown): Promise<DeviceActionResult> {
    if (!this.options.enabled) {
      throw new ApiError(
        'actions_disabled',
        'Device actions are disabled. Set DEVICE_ACTIONS_ENABLED=true to enable them. ' +
          'Authentication is not implemented yet: enable only on a trusted network.',
      );
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((issue) =>
        issue.code === 'unrecognized_keys'
          ? `unexpected field(s): ${issue.keys.join(', ')}`
          : `${issue.path.join('.') || 'body'}: ${issue.message}`,
      );
      throw new ApiError('bad_request', `Invalid request body: ${problems.join('; ')}`);
    }
    const { command, params: rawParams, requestId } = parsed.data;

    const { registry } = this.options;
    const device = registry.get(deviceId);
    const binding = registry.resolve(deviceId);
    if (!device || !binding) throw new ApiError('not_found', 'Device not found');

    // Allowlist: only what this device advertises right now.
    const spec = device.commands.find((candidate) => candidate.name === command);
    if (!spec) {
      const supported = device.commands.map((c) => c.name).join(', ') || 'none';
      throw new ApiError(
        'unsupported_action',
        `This device does not support "${command}". Supported commands: ${supported}`,
      );
    }
    if (device.availability === 'unavailable') {
      throw new ApiError(
        'device_unavailable',
        'The device is unavailable and cannot be controlled',
      );
    }

    const params = validateParams(spec, rawParams);
    const context: AdapterContext = { apps: this.options.apps };
    const call = toServiceCall(binding, command, params, context);
    if (!call) {
      throw new ApiError(
        'unsupported_action',
        `"${command}" is not available for this device type`,
      );
    }

    if (!requestId) return this.run(deviceId, command, params, null, call);

    return this.runIdempotent(deviceId, command, params, requestId, call);
  }

  private viewOf(deviceId: string): Device | null {
    return (
      (this.options.view ?? this.options.registry.get.bind(this.options.registry))(deviceId) ?? null
    );
  }

  private async runIdempotent(
    deviceId: string,
    command: string,
    params: Record<string, unknown>,
    requestId: string,
    call: NonNullable<ReturnType<typeof toServiceCall>>,
  ): Promise<DeviceActionResult> {
    this.evictExpired();
    const key = `${deviceId}:${requestId}`;
    const fingerprint = fingerprintOf(command, params);

    const existing = this.idempotency.get(key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) {
        throw new ApiError(
          'conflict',
          'requestId was already used with a different command or params for this device',
        );
      }
      const original = await existing.result;
      return { ...original, replayed: true, device: this.viewOf(deviceId) };
    }

    const result = this.run(deviceId, command, params, requestId, call);
    this.idempotency.set(key, { fingerprint, createdAt: Date.now(), result });
    while (this.idempotency.size > this.maxEntries) {
      const oldest = this.idempotency.keys().next().value;
      if (oldest === undefined) break;
      this.idempotency.delete(oldest);
    }

    const outcome = await result;
    // A failure must stay retryable with the same requestId.
    if (outcome.status === 'failed') this.idempotency.delete(key);
    return outcome;
  }

  private async run(
    deviceId: string,
    command: string,
    params: Record<string, unknown>,
    requestId: string | null,
    call: NonNullable<ReturnType<typeof toServiceCall>>,
  ): Promise<DeviceActionResult> {
    const { homeAssistant, logger } = this.options;
    const base = { deviceId, command, requestId, replayed: false };

    try {
      await homeAssistant.rest.callService(call.domain, call.service, call.data);
    } catch (error) {
      const payload = toErrorPayload(error);
      logger.warn({ deviceId, command, code: payload.code }, 'device action failed');
      return { ...base, status: 'failed', error: payload, device: this.viewOf(deviceId) };
    }

    const expectation = expectationFor(command, params);
    const confirmed = expectation ? await this.waitForState(deviceId, expectation) : false;
    const status = confirmed ? 'confirmed' : 'accepted';

    logger.info(
      { deviceId, command, service: `${call.domain}.${call.service}`, status },
      'device action',
    );
    return { ...base, status, device: this.viewOf(deviceId) };
  }

  /** Resolves true as soon as the device state satisfies the expectation, false on timeout. */
  private waitForState(deviceId: string, expectation: Expectation): Promise<boolean> {
    const { registry } = this.options;
    const satisfied = (device: Device | undefined) =>
      device !== undefined && expectation(device.state);
    if (satisfied(registry.get(deviceId))) return Promise.resolve(true);

    return new Promise<boolean>((resolve) => {
      let unsubscribe = () => {};
      const timer = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, this.confirmTimeoutMs);
      unsubscribe = registry.onChange((changedId) => {
        if (changedId !== deviceId || !satisfied(registry.get(deviceId))) return;
        clearTimeout(timer);
        unsubscribe();
        resolve(true);
      });
    });
  }

  private evictExpired(): void {
    const limit = Date.now() - this.idempotencyTtlMs;
    for (const [key, entry] of this.idempotency) {
      if (entry.createdAt < limit) this.idempotency.delete(key);
    }
  }
}
