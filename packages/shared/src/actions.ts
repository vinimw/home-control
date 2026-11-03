import type { ApiErrorPayload } from './errors.js';
import type { Device, DeviceAvailability, DeviceRegistrySummary, DeviceType } from './devices.js';

export const API_DEVICES_PATH = '/devices';

/** `POST /devices/:id/actions` request body. Only canonical commands are accepted. */
export interface DeviceActionRequest {
  /** A command from the device's own `commands` list, e.g. `set_volume`. */
  command: string;
  /** Parameters exactly as declared by that command. Extra or missing params are rejected. */
  params?: Record<string, unknown>;
  /**
   * Optional idempotency key (1-64 chars of `A-Za-z0-9_-`). Repeating the same request with the same key
   * does not execute it twice; reusing the key with a different request is a `conflict`.
   */
  requestId?: string;
}

/**
 * - `accepted`: Home Assistant accepted the call, but the resulting state was not observed (yet).
 * - `confirmed`: the expected resulting state was observed.
 * - `failed`: the call was executed but Home Assistant (or the network) failed; see `error`.
 */
export type DeviceActionStatus = 'accepted' | 'confirmed' | 'failed';

export interface DeviceActionResult {
  status: DeviceActionStatus;
  deviceId: string;
  command: string;
  requestId: string | null;
  /** True when this is the stored outcome of an earlier request with the same `requestId`. */
  replayed: boolean;
  /** Present when `status` is `failed`. */
  error?: ApiErrorPayload;
  /** The device as currently known (best effort; may not yet reflect the change when `accepted`). */
  device: Device | null;
}

export interface DeviceListResponse {
  devices: Device[];
  summary: DeviceRegistrySummary;
}

export interface DeviceListQuery {
  type?: DeviceType;
  availability?: DeviceAvailability;
  roomId?: string;
}
