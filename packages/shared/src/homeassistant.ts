import type { DeviceRegistrySummary } from './devices.js';
import type { ApiErrorPayload } from './errors.js';

export type HomeAssistantConnectionState =
  | 'not_configured'
  | 'idle'
  | 'connecting'
  | 'authenticating'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'stopped';

/** Snapshot of the Home Assistant integration. Never includes credentials. */
export interface HomeAssistantStatus {
  configured: boolean;
  /** True when REST is reachable and the realtime connection is established. */
  healthy: boolean;
  realtime: {
    state: HomeAssistantConnectionState;
    reconnectAttempts: number;
    lastConnectedAt: string | null;
    haVersion: string | null;
    lastError: ApiErrorPayload | null;
  };
  rest: {
    reachable: boolean;
    error: ApiErrorPayload | null;
  };
}

export const API_HA_STATUS_PATH = '/ha/status';
export const API_HA_PING_PATH = '/ha/ping';

/** `GET /ha/status` response: integration health plus device registry counters (no device data). */
export interface HomeAssistantStatusResponse extends HomeAssistantStatus {
  devices: DeviceRegistrySummary;
}
