import {
  API_HA_STATUS_PATH,
  API_DEVICES_PATH,
  API_HEALTH_PATH,
  type DeviceListResponse,
  type HealthResponse,
  type HomeAssistantStatusResponse,
} from '@home-control/shared';
import { env } from './env';

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${env.API_INTERNAL_URL}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    // Unreachable, timed out or invalid JSON: reported as "unknown", never as a fake value.
    return null;
  }
}

/** Server-side only: the initial device list, or `null` when the API cannot be reached. */
export function getDevices(): Promise<DeviceListResponse | null> {
  return getJson<DeviceListResponse>(API_DEVICES_PATH);
}

export interface SystemStatus {
  /** `null` means the API could not be reached. */
  api: HealthResponse | null;
  /** `null` means unknown (API unreachable). */
  homeAssistant: HomeAssistantStatusResponse | null;
}

/** Server-side only: talks to the API over the internal network. */
export async function getSystemStatus(): Promise<SystemStatus> {
  const [api, homeAssistant] = await Promise.all([
    getJson<HealthResponse>(API_HEALTH_PATH),
    getJson<HomeAssistantStatusResponse>(API_HA_STATUS_PATH),
  ]);
  return { api, homeAssistant };
}
