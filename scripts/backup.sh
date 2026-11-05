#!/usr/bin/env bash
# Consistent backup of the API's SQLite database (and its encryption key) while the stack is running.
# Usage: scripts/backup.sh [destination-dir]   (default: ./backups)
# Keeps the 14 newest backups. The key file protects Spotify tokens: keep backups private (chmod 700).
set -euo pipefail
cd "$(dirname "$0")/.."

dest="${1:-backups}"
service="${HC_API_SERVICE:-api}"
stamp="$(date +%Y%m%d-%H%M%S)"
out="$dest/home-control-$stamp"

container="$(docker compose ps -q "$service" 2>/dev/null || true)"
if [ -z "$container" ]; then
  echo "The '$service' container is not running; start it first (docker compose up -d)." >&2
  exit 1
fi

mkdir -p "$out"
chmod 700 "$dest" "$out"

# VACUUM INTO writes a transactionally consistent copy even while the API is using the database (WAL).
docker compose exec -T "$service" node --disable-warning=ExperimentalWarning -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync("/data/home-control.db");
  db.prepare("VACUUM INTO ?").run("/tmp/backup.db");
  db.close();
'
docker cp "$container:/tmp/backup.db" "$out/home-control.db"
docker compose exec -T "$service" rm -f /tmp/backup.db
# The key is only present when APP_SECRET_KEY is not set in .env.
docker cp "$container:/data/app-secret.key" "$out/app-secret.key" 2>/dev/null || true
chmod 600 "$out"/* 2>/dev/null || true

# Verify the copy opens and report what it holds.
docker run --rm -v "$(cd "$out" && pwd)":/b:ro node:22-alpine node --disable-warning=ExperimentalWarning -e '
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync("/b/home-control.db", { readOnly: true });
  const v = db.prepare("SELECT MAX(id) AS v FROM schema_migrations").get().v;
  const ok = db.prepare("PRAGMA integrity_check").get().integrity_check;
  console.log("backup verified: schema version " + v + ", integrity " + ok);
  if (ok !== "ok") process.exit(1);
'

# Retention: keep the newest 14.
ls -1d "$dest"/home-control-* 2>/dev/null | sort -r | tail -n +15 | while read -r old; do rm -rf "$old"; done
echo "Backup written to $out"
