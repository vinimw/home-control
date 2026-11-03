import { randomBytes } from 'node:crypto';
import { DEFAULT_APP_SETTINGS, type AppSettings, type Room } from '@home-control/shared';
import type { Database } from './database.js';
import {
  DuplicateRoomError,
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
