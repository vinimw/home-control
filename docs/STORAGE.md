# Persistence (SQLite)

The API keeps the **user's own metadata** in a small SQLite database: rooms, device aliases, favorites and
app settings. Home Assistant stays the single source of truth for devices: **no device state, capability,
entity id or credential is stored here**, so there is no second copy that can go stale.

## Where the data lives

| Environment        | Location                                                              |
| ------------------ | --------------------------------------------------------------------- |
| Local (`pnpm dev`) | `apps/api/data/home-control.db` (git-ignored), from `DATA_DIR`        |
| Docker             | Named volume `api-data`, mounted at `/data` (`/data/home-control.db`) |

SQLite runs in WAL mode, so you will also see `home-control.db-wal` and `-shm` next to it. They are part of
the database: never copy or delete the main file alone while the API is running (see Backup).

It uses Node's built-in `node:sqlite`, so there is no native module to build. That requires **Node >= 22.13**
and prints an "experimental" warning, which the scripts and the Docker image silence
(`--disable-warning=ExperimentalWarning`).

## What is stored

| Table                | Purpose                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `rooms`              | Rooms defined by the user (`rm_` + 12 hex id, unique case/accent-insensitive name, order). |
| `device_settings`    | Per device: alias, favorite, room. Keyed by the **opaque, stable device id**.              |
| `settings`           | App settings as JSON values (currently `homeName`).                                        |
| `auth_credential`    | The single password as a salted scrypt hash (at most one row).                             |
| `auth_sessions`      | Sessions: SHA-256 of the token (never the token), CSRF token, expiry.                      |
| `spotify_connection` | The connected Spotify account and its **encrypted** tokens (at most one row).              |
| `schema_migrations`  | Applied migrations with a checksum.                                                        |

Design choices worth knowing:

- **`device_settings` has no foreign key to a devices table** and rows are never deleted by a discovery
  refresh. The key is the stable id derived from the Home Assistant entity, so aliases, favorites and room
  mappings **survive refreshes, reconnects, restarts, and a device disappearing and coming back**.
- Deleting a room **unassigns** its devices (`ON DELETE SET NULL`); they fall back to the Home Assistant area.
- A row left with no customization (no alias, not favorite, no room) is removed.
- Rows of devices that no longer exist are kept (they cost nothing and reappear with the device). Clear them
  by resetting the device's settings through the API while it exists.

## How it is presented

`DeviceCatalog` layers the metadata over the registry **at read time**: `name` is the alias when set (else
the Home Assistant name, always available as `sourceName`), and `room` is the user's room when assigned
(else the Home Assistant area). See [DEVICES_API.md](DEVICES_API.md) for the endpoints.

## Migrations

Versioned SQL in `apps/api/src/storage/migrations.ts`, applied at startup:

- **Safe to repeat.** Applied migrations are skipped; each new one runs in its own `BEGIN IMMEDIATE`
  transaction and is re-checked inside it, so concurrent processes cannot apply it twice.
- **Atomic.** A migration that fails is rolled back completely and the API refuses to start with a clear message.
- **Append-only.** Never edit a migration that shipped: the stored checksum detects it and startup is refused.
  Add a new migration with the next number instead.
- **No silent downgrades.** A database created by a newer version is refused.

The startup log shows `database ready` with `schemaVersion` and `migrationsApplied`.

## Repositories

The rest of the API depends on interfaces (`RoomRepository`, `DeviceSettingsRepository`,
`SettingsRepository` in `repositories.ts`), not on SQLite. `Storage` opens the database, migrates it and
exposes SQLite implementations; a different backend or a fake only has to implement the interfaces.

## Backup and restore (Docker)

Stop the API first so the WAL is checkpointed into the main file, then archive the volume:

```bash
docker compose stop api
docker run --rm -v home-control_api-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/api-data.tgz -C /data .
docker compose start api
```

Restore into an empty volume (the container runs as uid 1000):

```bash
docker compose down -v                      # WARNING: deletes the current data
docker volume create home-control_api-data
docker run --rm -v home-control_api-data:/data -v "$PWD":/backup alpine \
  sh -c 'tar xzf /backup/api-data.tgz -C /data && chown -R 1000:1000 /data'
docker compose up -d
```

`docker compose down -v` (or removing the volume) **deletes all rooms, aliases and favorites**. A plain
`down`, `restart`, or rebuilding the image keeps them.

## Limitations

- Single API process (SQLite file, synchronous access).
- Every endpoint, including the write ones, needs a login (see [SECURITY.md](SECURITY.md)).
- Only the metadata above is persisted; command history is a later task.
