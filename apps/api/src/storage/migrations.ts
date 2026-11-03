import { createHash } from 'node:crypto';
import { inTransaction, type Database } from './database.js';
import { StorageError } from './errors.js';

export interface Migration {
  /** Strictly increasing, starting at 1. Never reuse or renumber an id. */
  id: number;
  name: string;
  sql: string;
}

/**
 * Append-only list. NEVER edit a migration that has shipped: add a new one. Editing is detected through
 * the stored checksum and refused at startup.
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'rooms_device_settings_and_settings',
    sql: `
      CREATE TABLE rooms (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        name_key    TEXT NOT NULL UNIQUE,
        sort_order  INTEGER NOT NULL DEFAULT 0,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );

      -- User metadata only. Keyed by the opaque, stable device id, never by the provider entity, and
      -- deliberately without a foreign key to any device table: it must survive discovery refreshes and a
      -- device being temporarily missing. Device state and capabilities stay in Home Assistant.
      CREATE TABLE device_settings (
        device_id   TEXT PRIMARY KEY,
        alias       TEXT,
        favorite    INTEGER NOT NULL DEFAULT 0 CHECK (favorite IN (0, 1)),
        room_id     TEXT REFERENCES rooms(id) ON DELETE SET NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX idx_device_settings_room ON device_settings(room_id);

      CREATE TABLE settings (
        key         TEXT PRIMARY KEY,
        value       TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
    `,
  },
];

const checksumOf = (sql: string): string => createHash('sha256').update(sql).digest('hex');

export interface MigrationResult {
  /** Ids applied during this call (empty when the database was already up to date). */
  applied: number[];
  /** Highest migration id now applied. */
  version: number;
}

interface AppliedRow {
  id: number;
  name: string;
  checksum: string;
}

/**
 * Brings the database to the latest schema. Safe to call any number of times, including from several
 * processes: each migration runs in its own `BEGIN IMMEDIATE` transaction and is re-checked inside it.
 */
export function runMigrations(
  db: Database,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  const ids = migrations.map((m) => m.id);
  if (ids.some((id, index) => id !== index + 1)) {
    throw new StorageError('Migrations must be numbered 1, 2, 3... without gaps or duplicates.');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER PRIMARY KEY,
      name        TEXT NOT NULL,
      checksum    TEXT NOT NULL,
      applied_at  TEXT NOT NULL
    )
  `);

  const readApplied = () =>
    db
      .prepare('SELECT id, name, checksum FROM schema_migrations ORDER BY id')
      .all() as unknown as AppliedRow[];

  const known = new Map(migrations.map((m) => [m.id, m]));
  for (const row of readApplied()) {
    const migration = known.get(row.id);
    if (!migration) {
      throw new StorageError(
        `The database is at migration ${row.id} ("${row.name}"), which this version does not know. ` +
          'It was created by a newer version: update the application instead of downgrading.',
      );
    }
    if (row.checksum !== checksumOf(migration.sql)) {
      throw new StorageError(
        `Migration ${row.id} ("${row.name}") changed after it was applied. Never edit a shipped migration; add a new one.`,
      );
    }
  }

  const applied: number[] = [];
  for (const migration of migrations) {
    inTransaction(db, () => {
      // Re-check inside the lock: another process may have applied it meanwhile.
      const done = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(migration.id);
      if (done) return;
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations (id, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
      ).run(migration.id, migration.name, checksumOf(migration.sql), new Date().toISOString());
      applied.push(migration.id);
    });
  }

  const current = readApplied();
  return { applied, version: current.at(-1)?.id ?? 0 };
}
