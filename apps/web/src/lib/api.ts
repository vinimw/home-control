import {
  API_DEVICE_LAYOUT_PATH,
  type DeviceLayout,
  API_ALEXA_COMMANDS_PATH,
  API_CUSTOM_DEVICES_PATH,
  API_ROOMS_PATH,
  type CustomDeviceListResponse,
  type RoomListResponse,
  API_HA_STATUS_PATH,
  type AlexaCommandListResponse,
  API_DEVICES_PATH,
  API_HEALTH_PATH,
  type DeviceListResponse,
  type HealthResponse,
  type HomeAssistantStatusResponse,
} from '@home-control/shared';
import { redirect } from 'next/navigation';
import { env } from './env';
import { cookieHeader } from './session';

async function getJson<T>(path: string): Promise<T | null> {
  let unauthorized = false;
  let result: T | null = null;
  try {
    const response = await fetch(`${env.API_INTERNAL_URL}${path}`, {
      cache: 'no-store',
      headers: await cookieHeader(),
      signal: AbortSignal.timeout(3000),
    });
    unauthorized = response.status === 401;
    result = response.ok ? ((await response.json()) as T) : null;
  } catch {
    // Unreachable, timed out or invalid JSON: reported as "unknown", never as a fake value.
  }
  // Outside the try: `redirect` works by throwing.
  if (unauthorized) redirect('/login');
  return result;
}

/** Server-side only: the initial device list, or `null` when the API cannot be reached. */
export function getDevices(): Promise<DeviceListResponse | null> {
  return getJson<DeviceListResponse>(API_DEVICES_PATH);
}

/** Server-side only: the saved Alexa commands, or `null` when the API cannot be reached. */
export function getAlexaCommands(): Promise<AlexaCommandListResponse | null> {
  return getJson<AlexaCommandListResponse>(API_ALEXA_COMMANDS_PATH);
}

/** Server-side only: the custom device cards, or `null` when the API cannot be reached. */
export function getCustomDevices(): Promise<CustomDeviceListResponse | null> {
  return getJson<CustomDeviceListResponse>(API_CUSTOM_DEVICES_PATH);
}

/** Server-side only: the rooms, or `null` when the API cannot be reached. */
export function getRooms(): Promise<RoomListResponse | null> {
  return getJson<RoomListResponse>(API_ROOMS_PATH);
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

export function getDeviceLayout(): Promise<DeviceLayout | null> {
  return getJson<DeviceLayout>(API_DEVICE_LAYOUT_PATH);
}
