# Always-on Mac deployment

How to run Home Control on a Mac that stays on at home, from power-on to "ready", and how to recover.
Home Assistant (the VM) setup is in [HOME_ASSISTANT.md](HOME_ASSISTANT.md); the database is described in
[STORAGE.md](STORAGE.md).

## What runs where

| Piece                    | Runs as                  | Restart behavior                                                                  |
| ------------------------ | ------------------------ | --------------------------------------------------------------------------------- |
| Home Assistant OS        | VM (UTM or similar)      | Started at login (see "Boot to ready")                                            |
| `api` (Fastify + SQLite) | Docker container         | `restart: unless-stopped`, health check on `/health`                              |
| `web` (Next.js)          | Docker container         | `restart: unless-stopped`, waits for a healthy API, health check on `/api/health` |
| Data                     | Docker volume `api-data` | Survives restarts, rebuilds and `docker compose down`                             |

## Network: LAN only, no public ports

- The **API** is published on `127.0.0.1` only (`API_BIND_ADDRESS`); phones reach it through the web app.
- The **web** port (`WEB_HOST_PORT`, default 3000) listens on the home network so phones can open it. Set
  `WEB_BIND_ADDRESS=127.0.0.1` to keep it on the Mac only.
- **Never forward either port on the router**, and do not enable UPnP for them. For access away from home
  use a VPN to the home network, not an open port.
- Give the Mac and the Home Assistant VM **DHCP reservations** so addresses do not change.
- Keep the macOS firewall on (System Settings > Network > Firewall); allow Docker when asked.
- Every API route needs a login (see [SECURITY.md](SECURITY.md)); `scripts/smoke.sh` checks that the API
  port is on loopback.

## Mac settings (once)

1. **Prevent sleep:** System Settings > Energy (or Battery > Options) > _Prevent automatic sleeping when the
   display is off_; keep "Wake for network access" on. On a laptop leave it plugged in. Alternatively
   `sudo pmset -a sleep 0 disksleep 0` (display may still sleep).
2. **Start after a power cut:** Energy > _Start up automatically after a power failure_.
3. **Auto-login** for the dedicated user (needed for Login Items and Docker Desktop to start unattended;
   FileVault blocks auto-login, so decide consciously).
4. **Login Items:** add Docker Desktop and the Home Assistant VM (UTM can start one with
   `utmctl start "<vm-name>"`). In Docker Desktop enable _Start Docker Desktop when you sign in_.
5. Automatic macOS updates: allow downloads, but install on a schedule you choose, then run the checklist
   below; an unattended reboot is covered by "Boot to ready".

## Boot to ready

Expected order after the Mac powers on, with no manual step:

1. macOS logs in the dedicated user.
2. Docker Desktop starts; Compose restarts `api` and `web` (policy `unless-stopped`). `web` waits until
   `api` is healthy.
3. The Home Assistant VM starts (Login Item). It takes a few minutes. Until it is up the API stays healthy
   but reports Home Assistant as unreachable, and the app shows device data as unavailable; it reconnects
   by itself.
4. Run the readiness check:

```bash
scripts/smoke.sh        # exit 0 and "READY" when everything is fine
```

It checks Docker, container health, `/health` on both services, that the API is not published beyond
loopback, that Home Assistant answers with the configured token, that the database exists and that log
rotation is active. It sends no device command.

## Logs

Container logs rotate automatically (`compose.yaml`: 5 files x 10 MB per service), so they cannot fill the
disk. Read them with `docker compose logs --since 1h api`. Logs never contain the token (it is redacted).

## Backup and restore

The database holds rooms, aliases, scenes, saved Alexa commands, the encrypted Spotify connection, the user
account and the command history. `scripts/backup.sh` makes a **consistent copy while the stack is running**
(SQLite `VACUUM INTO`, no downtime), copies the encryption key file if one is used, verifies the copy and
keeps the newest 14.

```bash
scripts/backup.sh                    # -> ./backups/home-control-<date>/  (ignored by Git)
scripts/backup.sh /Volumes/Backup/hc # another disk
scripts/restore.sh backups/home-control-20261105-004535   # asks for confirmation
```

- Run it daily, for example from `launchd` or `cron`:
  `0 3 * * * cd /path/to/home-control && scripts/backup.sh /Volumes/Backup/hc >> /tmp/hc-backup.log 2>&1`.
- **Copy backups off the Mac** (another disk or cloud). A backup on the same disk dies with it.
- The folder contains the database **and** `app-secret.key`, which decrypts the Spotify tokens: keep it
  private (the script sets mode 700/600). If you set `APP_SECRET_KEY` in `.env`, back up `.env` instead.
- `restore.sh` stops the API, keeps what it replaces under `/data/pre-restore` inside the volume, restores,
  fixes ownership and starts the API again. Home Assistant has its own backups (HOME_ASSISTANT.md).
- A plain `docker compose down`, restart or rebuild keeps the data; `docker compose down -v` **deletes it**.

## Cold-start recovery

| Situation                    | What to do                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Power cut / reboot           | Wait for "Boot to ready"; run `scripts/smoke.sh`                               |
| Containers not running       | `docker compose up -d`, then `scripts/smoke.sh`                                |
| Docker Desktop did not start | Open it; enable start at login                                                 |
| Home Assistant not reachable | Start the VM; confirm its IP (DHCP reservation); `pnpm ha:check`               |
| HA says 401 / token rejected | Create a new long-lived token, put it in `.env`, `docker compose up -d api`    |
| Database damaged or lost     | `scripts/restore.sh <latest backup>`                                           |
| Locked out of the app        | See SECURITY.md (reset the password with the auth CLI)                         |
| Disk almost full             | `docker system df`; `docker image prune`; old backups are pruned by the script |

## Manual smoke checklist (after install, an update or a reboot)

- [ ] `scripts/smoke.sh` ends in READY.
- [ ] The app opens from a phone on the home Wi-Fi and asks for the login.
- [ ] Início/Dispositivos list the TV, the Echo and Spotify as available.
- [ ] The TV: mute then unmute (or volume up/down) is confirmed in the app and visible on the TV.
- [ ] Música: the player shows the Spotify outputs; play/pause works once an output is active.
- [ ] Cenas: run a harmless scene; every step shows its own result.
- [ ] From mobile data (Wi-Fi off) the app is **not** reachable (no public port).
- [ ] `scripts/backup.sh` finishes with "backup verified".
- [ ] Reboot the Mac, wait, run `scripts/smoke.sh` again: READY without touching anything.

## Limitations

- Docker Desktop and the VM need a logged-in session; a headless Mac without auto-login will not start them.
- Health checks detect a dead service, not a wrong device state; Home Assistant being down shows up in
  `smoke.sh` and in the app, but nothing restarts the VM for you.
- No automatic off-site backup: schedule the copy yourself.
- Not exercised on the production Mac in this task: the sleep/auto-login settings and a real reboot are
  documented, not tested here.
