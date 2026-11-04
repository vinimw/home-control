import { randomBytes } from 'node:crypto';
import {
  DEFAULT_APP_SETTINGS,
  type AlexaCommand,
  type AlexaCommandInput,
  type AppSettings,
  type Room,
} from '@home-control/shared';
import type { Database } from './database.js';
import {
  DuplicateRoomError,
  type AlexaCommandRepository,
  type AuthRepository,
  type SpotifyConnectionRecord,
  type SpotifyRepository,
  type SessionRecord,
  type DeviceSettingsChange,
  type DeviceSettingsRecord,
  type DeviceSettingsRepository,
  type RoomRepository,
  type SettingsRepository,
} from './repositories.js';

const now = () => new Date().toISOString();

/** Case-insensitive, accent-aware uniqueness key for room names. */
const keyOf = (name: string) => name.trim().toLocaleLowerCase('pt-BR');

const isUniqueViolation = (error: unknown) =>
  error instanceof Error && error.message.includes('UNIQUE constraint failed');

interface RoomRow {
  id: string;
  name: string;
  sort_order: number;
}
const toRoom = (row: RoomRow): Room => ({ id: row.id, name: row.name, sortOrder: row.sort_order });

export class SqliteRoomRepository implements RoomRepository {
  constructor(private readonly db: Database) {}

  list(): Room[] {
    const rows = this.db
      .prepare('SELECT id, name, sort_order FROM rooms ORDER BY sort_order, name_key')
      .all() as unknown as RoomRow[];
    return rows.map(toRoom);
  }

  get(id: string): Room | undefined {
    const row = this.db.prepare('SELECT id, name, sort_order FROM rooms WHERE id = ?').get(id) as
      RoomRow | undefined;
    return row && toRoom(row);
  }

  create(name: string): Room {
    const id = `rm_${randomBytes(6).toString('hex')}`;
    const timestamp = now();
    try {
      this.db
        .prepare(
          `INSERT INTO rooms (id, name, name_key, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM rooms), ?, ?)`,
        )
        .run(id, name.trim(), keyOf(name), timestamp, timestamp);
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateRoomError();
      throw error;
    }
    return this.get(id)!;
  }

  update(id: string, change: { name?: string; sortOrder?: number }): Room | undefined {
    if (!this.get(id)) return undefined;
    const sets: string[] = [];
    const values: Array<string | number> = [];
    if (change.name !== undefined) {
      sets.push('name = ?', 'name_key = ?');
      values.push(change.name.trim(), keyOf(change.name));
    }
    if (change.sortOrder !== undefined) {
      sets.push('sort_order = ?');
      values.push(change.sortOrder);
    }
    if (sets.length > 0) {
      try {
        this.db
          .prepare(`UPDATE rooms SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
          .run(...values, now(), id);
      } catch (error) {
        if (isUniqueViolation(error)) throw new DuplicateRoomError();
        throw error;
      }
    }
    return this.get(id);
  }

  delete(id: string): boolean {
    // `device_settings.room_id` is ON DELETE SET NULL: devices become unassigned.
    return Number(this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id).changes) > 0;
  }

  count(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM rooms').get() as { n: number }).n);
  }
}

interface DeviceSettingsRow {
  device_id: string;
  alias: string | null;
  favorite: number;
  room_id: string | null;
}
const toRecord = (row: DeviceSettingsRow): DeviceSettingsRecord => ({
  deviceId: row.device_id,
  alias: row.alias,
  favorite: row.favorite === 1,
  roomId: row.room_id,
});

export class SqliteDeviceSettingsRepository implements DeviceSettingsRepository {
  constructor(private readonly db: Database) {}

  get(deviceId: string): DeviceSettingsRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT device_id, alias, favorite, room_id FROM device_settings WHERE device_id = ?',
      )
      .get(deviceId) as DeviceSettingsRow | undefined;
    return row && toRecord(row);
  }

  all(): Map<string, DeviceSettingsRecord> {
    const rows = this.db
      .prepare('SELECT device_id, alias, favorite, room_id FROM device_settings')
      .all() as unknown as DeviceSettingsRow[];
    return new Map(rows.map((row) => [row.device_id, toRecord(row)]));
  }

  update(deviceId: string, change: DeviceSettingsChange): DeviceSettingsRecord | undefined {
    const current = this.get(deviceId) ?? { deviceId, alias: null, favorite: false, roomId: null };
    const next: DeviceSettingsRecord = {
      deviceId,
      alias: change.alias !== undefined ? change.alias : current.alias,
      favorite: change.favorite ?? current.favorite,
      roomId: change.roomId !== undefined ? change.roomId : current.roomId,
    };

    // Nothing customized any more: keep the table free of empty rows.
    if (next.alias === null && !next.favorite && next.roomId === null) {
      this.db.prepare('DELETE FROM device_settings WHERE device_id = ?').run(deviceId);
      return undefined;
    }

    this.db
      .prepare(
        `INSERT INTO device_settings (device_id, alias, favorite, room_id, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(device_id) DO UPDATE SET
           alias = excluded.alias, favorite = excluded.favorite,
           room_id = excluded.room_id, updated_at = excluded.updated_at`,
      )
      .run(deviceId, next.alias, next.favorite ? 1 : 0, next.roomId, now());
    return next;
  }

  count(): number {
    return Number(
      (this.db.prepare('SELECT COUNT(*) AS n FROM device_settings').get() as { n: number }).n,
    );
  }
}

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Database) {}

  get(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as unknown as Array<{
      key: string;
      value: string;
    }>;
    const stored = new Map(rows.map((row) => [row.key, row.value]));
    const settings: AppSettings = { ...DEFAULT_APP_SETTINGS };

    const homeName = stored.get('homeName');
    if (homeName !== undefined) {
      try {
        const parsed: unknown = JSON.parse(homeName);
        if (typeof parsed === 'string' && parsed.trim() !== '') settings.homeName = parsed;
      } catch {
        // A corrupt value falls back to the default instead of breaking the whole settings read.
      }
    }
    return settings;
  }

  update(change: Partial<AppSettings>): AppSettings {
    const upsert = this.db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    );
    if (change.homeName !== undefined)
      upsert.run('homeName', JSON.stringify(change.homeName), now());
    return this.get();
  }
}

interface SessionRow {
  id_hash: string;
  csrf_token: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
}

export class SqliteAuthRepository implements AuthRepository {
  constructor(private readonly db: Database) {}

  getPasswordHash(): string | undefined {
    const row = this.db.prepare('SELECT password_hash FROM auth_credential WHERE id = 1').get() as
      { password_hash: string } | undefined;
    return row?.password_hash;
  }

  setPasswordHash(hash: string): void {
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO auth_credential (id, password_hash, created_at, updated_at) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = excluded.updated_at`,
      )
      .run(hash, timestamp, timestamp);
  }

  clearCredential(): void {
    this.db.exec('DELETE FROM auth_credential; DELETE FROM auth_sessions;');
  }

  createSession(session: SessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id_hash, csrf_token, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        session.idHash,
        session.csrfToken,
        session.createdAt,
        session.lastSeenAt,
        session.expiresAt,
      );
  }

  getSession(idHash: string): SessionRecord | undefined {
    const row = this.db
      .prepare(
        'SELECT id_hash, csrf_token, created_at, last_seen_at, expires_at FROM auth_sessions WHERE id_hash = ?',
      )
      .get(idHash) as SessionRow | undefined;
    return (
      row && {
        idHash: row.id_hash,
        csrfToken: row.csrf_token,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
        expiresAt: row.expires_at,
      }
    );
  }

  touchSession(idHash: string, lastSeenAt: string, expiresAt: string): void {
    this.db
      .prepare('UPDATE auth_sessions SET last_seen_at = ?, expires_at = ? WHERE id_hash = ?')
      .run(lastSeenAt, expiresAt, idHash);
  }

  deleteSession(idHash: string): void {
    this.db.prepare('DELETE FROM auth_sessions WHERE id_hash = ?').run(idHash);
  }

  deleteSessions(exceptIdHash?: string): number {
    const result = exceptIdHash
      ? this.db.prepare('DELETE FROM auth_sessions WHERE id_hash <> ?').run(exceptIdHash)
      : this.db.prepare('DELETE FROM auth_sessions').run();
    return Number(result.changes);
  }

  purgeExpired(at: string): number {
    const result = this.db.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(at);
    return Number(result.changes);
  }

  countSessions(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get() as { n: number };
    return row.n;
  }
}

interface SpotifyRow {
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  expires_at: string | null;
  scope: string;
  user_id: string;
  display_name: string | null;
  product: string | null;
  connected_at: string;
  reauth_required: number;
  last_error_code: string | null;
  last_error_message: string | null;
}

export class SqliteSpotifyRepository implements SpotifyRepository {
  constructor(private readonly db: Database) {}

  get(): SpotifyConnectionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM spotify_connection WHERE id = 1').get() as
      SpotifyRow | undefined;
    return (
      row && {
        accessTokenEnc: row.access_token_enc,
        refreshTokenEnc: row.refresh_token_enc,
        expiresAt: row.expires_at,
        scope: row.scope,
        userId: row.user_id,
        displayName: row.display_name,
        product: row.product,
        connectedAt: row.connected_at,
        reauthRequired: row.reauth_required === 1,
        lastErrorCode: row.last_error_code,
        lastErrorMessage: row.last_error_message,
      }
    );
  }

  save(record: SpotifyConnectionRecord): void {
    this.db
      .prepare(
        `INSERT INTO spotify_connection
           (id, access_token_enc, refresh_token_enc, expires_at, scope, user_id, display_name, product,
            connected_at, reauth_required, last_error_code, last_error_message, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc,
           expires_at = excluded.expires_at, scope = excluded.scope, user_id = excluded.user_id,
           display_name = excluded.display_name, product = excluded.product,
           connected_at = excluded.connected_at, reauth_required = excluded.reauth_required,
           last_error_code = excluded.last_error_code, last_error_message = excluded.last_error_message,
           updated_at = excluded.updated_at`,
      )
      .run(
        record.accessTokenEnc,
        record.refreshTokenEnc,
        record.expiresAt,
        record.scope,
        record.userId,
        record.displayName,
        record.product,
        record.connectedAt,
        record.reauthRequired ? 1 : 0,
        record.lastErrorCode,
        record.lastErrorMessage,
        now(),
      );
  }

  updateTokens(tokens: {
    accessTokenEnc: string;
    refreshTokenEnc: string;
    expiresAt: string;
    scope?: string;
  }): void {
    this.db
      .prepare(
        `UPDATE spotify_connection SET access_token_enc = ?, refresh_token_enc = ?, expires_at = ?,
           scope = COALESCE(?, scope), reauth_required = 0, last_error_code = NULL,
           last_error_message = NULL, updated_at = ? WHERE id = 1`,
      )
      .run(
        tokens.accessTokenEnc,
        tokens.refreshTokenEnc,
        tokens.expiresAt,
        tokens.scope ?? null,
        now(),
      );
  }

  markReauthRequired(error: { code: string; message: string }): void {
    this.db
      .prepare(
        `UPDATE spotify_connection SET access_token_enc = NULL, refresh_token_enc = NULL, expires_at = NULL,
           reauth_required = 1, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = 1`,
      )
      .run(error.code, error.message, now());
  }

  setLastError(error: { code: string; message: string } | null): void {
    this.db
      .prepare(
        'UPDATE spotify_connection SET last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = 1',
      )
      .run(error?.code ?? null, error?.message ?? null, now());
  }

  clear(): void {
    this.db.exec('DELETE FROM spotify_connection');
  }
}

interface AlexaCommandRow {
  id: string;
  name: string;
  text: string;
  device_id: string;
  created_at: string;
  updated_at: string;
}
const toAlexaCommand = (row: AlexaCommandRow): AlexaCommand => ({
  id: row.id,
  name: row.name,
  text: row.text,
  deviceId: row.device_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteAlexaCommandRepository implements AlexaCommandRepository {
  constructor(private readonly db: Database) {}

  list(): AlexaCommand[] {
    const rows = this.db
      .prepare('SELECT * FROM alexa_commands ORDER BY created_at, id')
      .all() as unknown as AlexaCommandRow[];
    return rows.map(toAlexaCommand);
  }

  get(id: string): AlexaCommand | undefined {
    const row = this.db.prepare('SELECT * FROM alexa_commands WHERE id = ?').get(id) as
      AlexaCommandRow | undefined;
    return row && toAlexaCommand(row);
  }

  create(input: AlexaCommandInput): AlexaCommand {
    const id = `ac_${randomBytes(6).toString('hex')}`;
    const timestamp = now();
    this.db
      .prepare(
        `INSERT INTO alexa_commands (id, name, text, device_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.name, input.text, input.deviceId, timestamp, timestamp);
    return this.get(id)!;
  }

  update(id: string, change: Partial<AlexaCommandInput>): AlexaCommand | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    this.db
      .prepare(
        'UPDATE alexa_commands SET name = ?, text = ?, device_id = ?, updated_at = ? WHERE id = ?',
      )
      .run(
        change.name ?? current.name,
        change.text ?? current.text,
        change.deviceId ?? current.deviceId,
        now(),
        id,
      );
    return this.get(id);
  }

  delete(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM alexa_commands WHERE id = ?').run(id).changes) > 0;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM alexa_commands').get() as { n: number };
    return Number(row.n);
  }
}
