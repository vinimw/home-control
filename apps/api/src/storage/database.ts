import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { StorageError } from './errors.js';

export type Database = DatabaseSync;

export const IN_MEMORY = ':memory:';

/**
 * Opens (creating if needed) the SQLite database with the pragmas this app relies on.
 * Uses Node's built-in `node:sqlite`: no native dependency to compile or download.
 */
export function openDatabase(file: string): Database {
  try {
    if (file !== IN_MEMORY) mkdirSync(dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec(`
      PRAGMA journal_mode = WAL;     -- readers do not block the writer; survives crashes
      PRAGMA synchronous = NORMAL;   -- safe with WAL
      PRAGMA foreign_keys = ON;      -- enforce room references
      PRAGMA busy_timeout = 5000;    -- wait instead of failing when another connection writes
    `);
    return db;
  } catch (error) {
    throw new StorageError(
      `Could not open the database at "${file}". Check that the directory is writable.`,
      {
        cause: error,
      },
    );
  }
}

/** Runs `work` inside a write transaction; rolls back if it throws. */
export function inTransaction<T>(db: Database, work: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
