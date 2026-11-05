#!/usr/bin/env bash
# Boot-to-ready check for the always-on Mac. Read-only: sends no device command.
# Usage: scripts/smoke.sh        Exit code 0 = ready, 1 = something needs attention.
set -uo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] && { set -a; . ./.env; set +a; }

fail=0
ok()   { printf '  [ok]   %s\n' "$1"; }
warn() { printf '  [warn] %s\n' "$1"; }
bad()  { printf '  [FAIL] %s\n' "$1"; fail=1; }

web_port="${WEB_HOST_PORT:-3000}"
api_port="${API_HOST_PORT:-3001}"
echo "Home Control readiness"

command -v docker >/dev/null 2>&1 || { bad "docker not found"; exit 1; }
docker info >/dev/null 2>&1 && ok "Docker is running" || { bad "Docker is not running (open Docker Desktop)"; exit 1; }

for s in api web; do
  state="$(docker compose ps --format '{{.Health}}' "$s" 2>/dev/null | head -n1)"
  case "$state" in
    healthy) ok "$s container healthy" ;;
    "") bad "$s container not running (docker compose up -d)" ;;
    *) bad "$s container is '$state'" ;;
  esac
done

curl -fsS -m 5 "http://127.0.0.1:$api_port/health" >/dev/null 2>&1 && ok "API /health answers" || bad "API /health does not answer"
curl -fsS -m 5 "http://127.0.0.1:$web_port/api/health" >/dev/null 2>&1 && ok "Web /api/health answers" || bad "Web /api/health does not answer"

# No public exposure: the API must be on loopback; the web port is for the home network only.
api_bind="$(docker compose port api 3001 2>/dev/null | head -n1)"
case "$api_bind" in
  127.0.0.1:*|"") ok "API port is bound to loopback only (${api_bind:-not published})" ;;
  *) bad "API port is published on $api_bind; set API_BIND_ADDRESS=127.0.0.1" ;;
esac
web_bind="$(docker compose port web 3000 2>/dev/null | head -n1)"
case "$web_bind" in
  0.0.0.0:*) warn "Web is on all interfaces ($web_bind): fine for the home network, never forward it on the router" ;;
  *) ok "Web is bound to ${web_bind:-not published}" ;;
esac

# Home Assistant reachable from the API (through the container, with its own token).
if docker compose exec -T api node -e '
  const u=process.env.HOME_ASSISTANT_URL,t=process.env.HOME_ASSISTANT_TOKEN;
  if(!u||!t){console.log("unset");process.exit(3)}
  fetch(u+"/api/",{headers:{Authorization:"Bearer "+t},signal:AbortSignal.timeout(6000)})
    .then(r=>process.exit(r.ok?0:r.status===401?4:5)).catch(()=>process.exit(6))' >/dev/null 2>&1; then
  ok "Home Assistant reachable and token accepted"
else
  case $? in
    3) warn "HOME_ASSISTANT_URL/TOKEN not set" ;;
    4) bad "Home Assistant rejected the token (create a new long-lived token)" ;;
    *) bad "Home Assistant not reachable (is the VM up? see docs/DEPLOYMENT.md, cold start)" ;;
  esac
fi

# Persistence and logs.
docker compose exec -T api test -s /data/home-control.db && ok "Database present on the data volume" || bad "Database missing on the data volume"
docker inspect "$(docker compose ps -q api 2>/dev/null)" --format '{{.HostConfig.LogConfig.Config}}' 2>/dev/null | grep -q max-size \
  && ok "Log rotation configured" || warn "Log rotation not active (recreate the containers: docker compose up -d)"

[ "$fail" -eq 0 ] && echo "READY" || echo "NOT READY: fix the items marked FAIL"
exit "$fail"
