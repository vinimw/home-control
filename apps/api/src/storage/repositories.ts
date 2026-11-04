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

export interface SessionRecord {
  /** SHA-256 of the session token. The token itself is never stored. */
  idHash: string;
  csrfToken: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
}

export interface AuthRepository {
  /** The password hash, or `undefined` before the first-run setup. */
  getPasswordHash(): string | undefined;
  /** Creates or replaces the single credential. */
  setPasswordHash(hash: string): void;
  clearCredential(): void;

  createSession(session: SessionRecord): void;
  getSession(idHash: string): SessionRecord | undefined;
  touchSession(idHash: string, lastSeenAt: string, expiresAt: string): void;
  deleteSession(idHash: string): void;
  /** Deletes every session, optionally keeping one. Returns how many were removed. */
  deleteSessions(exceptIdHash?: string): number;
  /** Removes sessions whose absolute expiry has passed. */
  purgeExpired(now: string): number;
  countSessions(): number;
}

export interface SpotifyConnectionRecord {
  /** Encrypted. `null` after the authorization stopped working. */
  accessTokenEnc: string | null;
  refreshTokenEnc: string | null;
  expiresAt: string | null;
  scope: string;
  userId: string;
  displayName: string | null;
  product: string | null;
  connectedAt: string;
  reauthRequired: boolean;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}

export interface SpotifyRepository {
  get(): SpotifyConnectionRecord | undefined;
  /** Creates or replaces the single connection. */
  save(record: SpotifyConnectionRecord): void;
  /** Updates only the tokens (after a refresh). */
  updateTokens(tokens: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    expiresAt: string;
    scope?: string;
  }): void;
  /** Drops the tokens and flags the connection as needing a new authorization. */
  markReauthRequired(error: { code: string; message: string }): void;
  setLastError(error: { code: string; message: string } | null): void;
  clear(): void;
}
