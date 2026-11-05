#!/usr/bin/env bash
# Restores a backup made by scripts/backup.sh into the API data volume. DESTRUCTIVE: replaces current data.
# Usage: scripts/restore.sh backups/home-control-YYYYMMDD-HHMMSS
set -euo pipefail
cd "$(dirname "$0")/.."

src="${1:-}"
if [ -z "$src" ] || [ ! -f "$src/home-control.db" ]; then
  echo "Usage: $0 <backup-directory containing home-control.db>" >&2
  exit 2
fi
src="$(cd "$src" && pwd)"
volume="${HC_VOLUME:-home-control_api-data}"

if [ "${HC_ASSUME_YES:-}" != "1" ]; then
  printf 'This REPLACES the data in volume "%s" with %s. Type "restore" to continue: ' "$volume" "$src"
  read -r answer
  [ "$answer" = "restore" ] || { echo "Cancelled."; exit 1; }
fi

[ "${HC_SKIP_COMPOSE:-}" = "1" ] || docker compose stop api
# Keep the data being replaced, just in case.
docker run --rm -v "$volume":/data -v "$src":/backup:ro alpine sh -c '
  set -e
  mkdir -p /data/pre-restore && cp -p /data/home-control.db /data/app-secret.key /data/pre-restore/ 2>/dev/null || true
  rm -f /data/home-control.db /data/home-control.db-wal /data/home-control.db-shm
  cp /backup/home-control.db /data/home-control.db
  [ -f /backup/app-secret.key ] && cp /backup/app-secret.key /data/app-secret.key
  chown -R 1000:1000 /data
  chmod 600 /data/app-secret.key 2>/dev/null || true
'
[ "${HC_SKIP_COMPOSE:-}" = "1" ] || docker compose up -d api
echo "Restored. The previous files were kept in /data/pre-restore inside the volume."
