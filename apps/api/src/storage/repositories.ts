import type { AppSettings, Room } from '@home-control/shared';

/**
 * Repository interfaces: the rest of the API depends on these, not on SQLite, so the storage can be
 * swapped (or faked) without touching the routes. Everything here is user-owned metadata; Home
 * Assistant remains authoritative for device state.
 */

export interface DeviceSettingsRecord {
  deviceId: string;
  alias: string | null;
  favorite: boolean;
  roomId: string | null;
}

export interface DeviceSettingsChange {
  alias?: string | null;
  favorite?: boolean;
  roomId?: string | null;
}

export interface DeviceSettingsRepository {
  get(deviceId: string): DeviceSettingsRecord | undefined;
  /** All records keyed by device id, in one query (used when listing). */
  all(): Map<string, DeviceSettingsRecord>;
  /** Applies only the provided fields. A record left with no customization is removed. */
  update(deviceId: string, change: DeviceSettingsChange): DeviceSettingsRecord | undefined;
  /** Number of stored records (including devices that are not currently discovered). */
  count(): number;
}

export class DuplicateRoomError extends Error {
  constructor() {
    super('A room with this name already exists');
    this.name = 'DuplicateRoomError';
  }
}

export interface RoomRepository {
  list(): Room[];
  get(id: string): Room | undefined;
  create(name: string): Room;
  /** Returns `undefined` when the room does not exist. Throws {@link DuplicateRoomError} on a name clash. */
  update(id: string, change: { name?: string; sortOrder?: number }): Room | undefined;
  /** Devices assigned to the room are unassigned, not deleted. */
  delete(id: string): boolean;
  count(): number;
}

export interface SettingsRepository {
  get(): AppSettings;
  update(change: Partial<AppSettings>): AppSettings;
}
