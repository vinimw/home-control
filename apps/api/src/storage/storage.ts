import { IN_MEMORY, openDatabase, type Database } from './database.js';
import { StorageError } from './errors.js';
import { SqliteDeviceLayoutRepository, type DeviceLayoutRepository } from './device-layout.js';
import { runMigrations, type MigrationResult } from './migrations.js';
import type {
  AlexaCommandRepository,
  AuthRepository,
  CustomDeviceRepository,
  SpotifyRepository,
  DeviceSettingsRepository,
  RoomRepository,
  SettingsRepository,
} from './repositories.js';
import {
  SqliteAlexaCommandRepository,
  SqliteAuthRepository,
  SqliteCustomDeviceRepository,
  SqliteSpotifyRepository,
  SqliteDeviceSettingsRepository,
  SqliteRoomRepository,
  SqliteSettingsRepository,
} from './sqlite-repositories.js';

export interface StorageSummary {
  schemaVersion: number;
  rooms: number;
  /** Customized devices stored, including ones that are not currently discovered. */
  deviceSettings: number;
}

/** The API's persistent storage: opens the database, migrates it and exposes the repositories. */
export class Storage {
  readonly layout: DeviceLayoutRepository;
  readonly rooms: RoomRepository;
  readonly deviceSettings: DeviceSettingsRepository;
  readonly settings: SettingsRepository;
  readonly auth: AuthRepository;
  readonly spotify: SpotifyRepository;
  readonly alexa: AlexaCommandRepository;
  readonly customDevices: CustomDeviceRepository;

  private constructor(
    private readonly db: Database,
    readonly migration: MigrationResult,
  ) {
    this.layout = new SqliteDeviceLayoutRepository(db);
    this.rooms = new SqliteRoomRepository(db);
    this.deviceSettings = new SqliteDeviceSettingsRepository(db);
    this.settings = new SqliteSettingsRepository(db);
    this.auth = new SqliteAuthRepository(db);
    this.spotify = new SqliteSpotifyRepository(db);
    this.alexa = new SqliteAlexaCommandRepository(db);
    this.customDevices = new SqliteCustomDeviceRepository(db);
  }

  /** Opens the database file and brings the schema up to date. Throws {@link StorageError}. */
  static open(file: string): Storage {
    const db = openDatabase(file);
    try {
      return new Storage(db, runMigrations(db));
    } catch (error) {
      db.close();
      if (error instanceof StorageError) throw error;
      throw new StorageError('The database migration failed; no change was kept.', {
        cause: error,
      });
    }
  }

  /** Non-persistent storage, for tests and for running without a data directory. */
  static openInMemory(): Storage {
    return Storage.open(IN_MEMORY);
  }

  summary(): StorageSummary {
    return {
      schemaVersion: this.migration.version,
      rooms: this.rooms.count(),
      deviceSettings: this.deviceSettings.count(),
    };
  }

  close(): void {
    if (this.db.isOpen) this.db.close();
  }
}
