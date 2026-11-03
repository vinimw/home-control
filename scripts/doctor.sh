#!/usr/bin/env bash
# Local environment diagnostics for macOS development. Read-only.
set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
ok()   { printf '  [ok]   %s\n' "$1"; }
warn() { printf '  [warn] %s\n' "$1"; }
bad()  { printf '  [FAIL] %s\n' "$1"; fail=1; }

echo "Home Control environment check"

# Node >= 22.13 (built-in node:sqlite without a flag, and --env-file-if-exists)
if command -v node >/dev/null 2>&1; then
  node_version=$(node -p 'process.versions.node')
  if node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
    ok "Node $node_version"
  else
    bad "Node $node_version is too old; need >= 22.13 (run: nvm install, see .nvmrc)"
  fi
else
  bad "Node not found (install it, e.g. with nvm or Homebrew)"
fi

if command -v pnpm >/dev/null 2>&1; then
  ok "pnpm $(pnpm -v 2>/dev/null)"
else
  bad "pnpm not found (run: corepack enable)"
fi

[ -d node_modules ] && ok "dependencies installed" || bad "dependencies missing (run: pnpm install)"
[ -f packages/shared/dist/index.js ] && ok "packages/shared built" || warn "packages/shared not built (run: pnpm build)"

if [ -f .env ]; then
  ok ".env present"
else
  warn ".env missing (run: pnpm env:init); defaults will be used"
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    ok "Docker daemon running"
  else
    warn "Docker installed but the daemon is not running (open Docker Desktop)"
  fi
else
  warn "Docker not found (only needed for 'docker compose')"
fi

for port in 3000 3001; do
  if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$port" -sTCP:LISTEN -n -P >/dev/null 2>&1; then
    warn "port $port is already in use (see docs/DEVELOPMENT.md, Troubleshooting)"
  else
    ok "port $port is free"
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "Problems found. Fix the [FAIL] items above."
  exit 1
fi
echo "Ready."
