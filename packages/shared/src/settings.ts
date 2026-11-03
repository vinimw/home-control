/** User-owned metadata persisted by the API. Home Assistant stays the source of truth for device state. */

export const API_ROOMS_PATH = '/rooms';
export const API_SETTINGS_PATH = '/settings';

/** A room defined by the user (independent from Home Assistant areas). */
export interface Room {
  /** Opaque id, `rm_` + 12 hex. */
  id: string;
  name: string;
  sortOrder: number;
}

export interface RoomCreate {
  name: string;
}

export interface RoomUpdate {
  name?: string;
  sortOrder?: number;
}

export interface RoomListResponse {
  rooms: Room[];
}

/** `PATCH /devices/:id/settings`. Only provided fields change; `null` clears a value. */
export interface DeviceSettingsUpdate {
  alias?: string | null;
  favorite?: boolean;
  roomId?: string | null;
}

export interface AppSettings {
  /** Display name of the home. */
  homeName: string;
}

export type AppSettingsUpdate = Partial<AppSettings>;

export const DEFAULT_APP_SETTINGS: AppSettings = { homeName: 'Minha casa' };
