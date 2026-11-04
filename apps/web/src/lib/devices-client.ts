import {
  API_DEVICES_PATH,
  type ApiErrorBody,
  type ApiErrorPayload,
  type Device,
  type DeviceActionResult,
  type DeviceListResponse,
} from '@home-control/shared';
import { csrfHeaders, redirectToLogin } from './csrf';

/**
 * Browser-side calls. They go to this app's own `/api/*` relay (same origin), never to the API directly.
 * Nothing here invents a result: any failure is reported as a failure.
 */

const BASE = `/api${API_DEVICES_PATH}`;
export const DEVICE_EVENTS_URL = `${BASE}/events`;

export async function fetchDevices(signal?: AbortSignal): Promise<DeviceListResponse> {
  const response = await fetch(BASE, { cache: 'no-store', signal });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw new Error(`devices request failed (${response.status})`);
  return (await response.json()) as DeviceListResponse;
}

/**
 * Unique id for idempotency. `crypto.randomUUID` only exists on HTTPS or localhost, and this app is
 * normally opened over plain http on the LAN (http://192.168.x.x), so it is built from random bytes.
 */
function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isActionResult(value: unknown): value is DeviceActionResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { status?: unknown }).status === 'string'
  );
}

function errorPayload(value: unknown): ApiErrorPayload | undefined {
  const error = (value as Partial<ApiErrorBody> | null)?.error;
  return error && typeof error.code === 'string' ? error : undefined;
}

/**
 * Sends a canonical command. The API answers 200/202 with `confirmed`/`accepted`, or an error: those are
 * turned into a `failed` result (never thrown away, never reported as success).
 */
export async function executeDeviceCommand(
  deviceId: string,
  command: string,
  params?: Record<string, unknown>,
): Promise<DeviceActionResult> {
  const failed = (error?: ApiErrorPayload): DeviceActionResult => ({
    status: 'failed',
    deviceId,
    command,
    requestId: null,
    replayed: false,
    error,
    device: null,
  });

  let response: Response;
  try {
    response = await fetch(`${BASE}/${deviceId}/actions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({
        command,
        ...(params ? { params } : {}),
        requestId: newRequestId(),
      }),
    });
  } catch {
    return failed();
  }

  if (response.status === 401) redirectToLogin();
  const body: unknown = await response.json().catch(() => null);
  if (response.ok && isActionResult(body)) return body;
  if (isActionResult(body)) return { ...body, status: 'failed' };
  return failed(errorPayload(body));
}

/** Persists alias/favorite/room. Resolves with the updated device, or `null` on any failure. */
export async function updateDeviceSettings(
  deviceId: string,
  change: { favorite?: boolean; alias?: string | null; roomId?: string | null },
): Promise<Device | null> {
  try {
    const response = await fetch(`${BASE}/${deviceId}/settings`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify(change),
    });
    if (response.status === 401) redirectToLogin();
    return response.ok ? ((await response.json()) as Device) : null;
  } catch {
    return null;
  }
}
