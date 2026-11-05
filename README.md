# Home Control

Local home control hub for a Samsung TV (QN55Q80AAGXZD), an Echo Show 8 and Spotify Premium,
orchestrated through Home Assistant. This repository is a pnpm monorepo.

## Structure

| Path              | Description                                            |
| ----------------- | ------------------------------------------------------ |
| `apps/web`        | Next.js (App Router, TypeScript) responsive web UI     |
| `apps/api`        | Fastify (TypeScript) backend, owner of all credentials |
| `packages/shared` | Shared TypeScript contracts used by `web` and `api`    |
| `docs/`           | Architecture and project documentation                 |
| `compose.yaml`    | Docker Compose stack (web + api)                       |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design.

## Quick start

```bash
corepack enable
pnpm install
pnpm env:init     # creates .env from .env.example
pnpm build
pnpm dev          # web on :3000, api on :3001
```

Requires macOS and Node >= 22.13 (see `.nvmrc`). Docker Desktop is only needed for the Compose stack.
Full guide, configuration reference and troubleshooting: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

- Web: http://localhost:3000
- API: http://localhost:3001 (health check: `GET /health`; everything else needs a login)

**Spotify** (optional, direct connection, not through Home Assistant): connect your account to play, control and browse your library. Needs your own Spotify app:
[docs/SPOTIFY.md](docs/SPOTIFY.md).

**Login.** On the first run the API prints a one-time setup code in its log; open the web app, enter it and
create your password. Forgot it, how sessions work and what is (not) protected:
[docs/SECURITY.md](docs/SECURITY.md). Never forward the ports on your router.
Running it always-on on a Mac (boot to ready, backups, recovery): [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Configuration

Environment variables are loaded from `.env` (git-ignored; template in `.env.example`) and validated on
startup. A missing or invalid value stops the API with a message naming the variable. Secrets never go in Git.
Run `pnpm dev:doctor` to diagnose your machine and `pnpm env:check` to validate your `.env`.

## Docker

The whole stack runs with Docker Compose (web + api, with a persistent volume for the API data).

```bash
cp .env.example .env     # optional; defaults work out of the box
docker compose up --build
```

- Web: http://localhost:3000 (shows the API status, proving web → api networking)
- API: http://localhost:3001/health
- Persistence: the named volume `api-data` is mounted at `/data` in the API container
  (SQLite will live there). Remove it with `docker compose down -v`.
- Home Assistant is **not** part of this stack; it runs separately in a macOS VM.
  See [docs/HOME_ASSISTANT.md](docs/HOME_ASSISTANT.md) for the setup and `pnpm ha:check` to test connectivity.
- Secrets in `.env` are passed only to the API service, never to the web service.
- Containers run as the non-root `node` user and expose healthchecks.

Change the published host ports with `WEB_HOST_PORT` and `API_HOST_PORT` in `.env`.

## Scripts

| Command           | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `pnpm dev`        | Run all packages in development mode                  |
| `pnpm build`      | Build all packages                                    |
| `pnpm check`      | Format check, lint, typecheck and build (before a PR) |
| `pnpm lint`       | Lint with ESLint                                      |
| `pnpm format`     | Format with Prettier                                  |
| `pnpm env:check`  | Validate the environment                              |
| `pnpm dev:doctor` | Diagnose the local setup                              |

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the complete list.

## Conventions

- GitHub Flow: short-lived branches from `main`, named `<type>/<issue>-<description>`.
- Conventional Commits, in English.
- No unit-test framework during the MVP; validate with lint, typecheck, build and manual smoke tests.
- Never commit credentials. Use `.env` files (ignored by Git) and provide `.env.example` templates.
