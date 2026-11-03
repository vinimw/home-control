#!/usr/bin/env bash
# Verifies that the running API container can reach the Home Assistant REST API.
# The token is read from the container environment (loaded from .env by Compose),
# so it never appears in this host shell command line.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! docker compose ps --status running --services 2>/dev/null | grep -qx api; then
  echo "ERROR: the 'api' service is not running. Start it with: docker compose up -d" >&2
  exit 2
fi

# shellcheck disable=SC2016  # variables must expand inside the container, not on the host
docker compose exec -T api sh -c '
  if [ -z "${HOME_ASSISTANT_URL:-}" ] || [ -z "${HOME_ASSISTANT_TOKEN:-}" ]; then
    echo "ERROR: HOME_ASSISTANT_URL and HOME_ASSISTANT_TOKEN must be set in .env" >&2
    echo "       (then recreate the API: docker compose up -d --force-recreate api)" >&2
    exit 2
  fi
  echo "Checking ${HOME_ASSISTANT_URL}/api/ ..."
  if body=$(wget -qO- -T 10 --header "Authorization: Bearer ${HOME_ASSISTANT_TOKEN}" "${HOME_ASSISTANT_URL}/api/" 2>&1); then
    echo "OK: ${body}"
  else
    echo "FAILED: could not get ${HOME_ASSISTANT_URL}/api/ (unreachable host, wrong port, or invalid token)." >&2
    echo "        See docs/HOME_ASSISTANT.md, section Troubleshooting." >&2
    exit 1
  fi
'
