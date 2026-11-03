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

## Requirements

- Node.js >= 22 (see `.nvmrc`)
- pnpm 10 (pinned through `packageManager`; enable with `corepack enable`)

## Setup

```bash
corepack enable
pnpm install
pnpm build        # builds shared, api and web
```

## Development

```bash
pnpm dev          # builds shared, then runs shared (watch), api and web in parallel
```

- Web: http://localhost:3000
- API: http://localhost:3001 (health check: `GET /health`)

The API reads `API_PORT` (default `3001`) and `API_HOST` (default `0.0.0.0`).

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
- Secrets in `.env` are passed only to the API service, never to the web service.
- Containers run as the non-root `node` user and expose healthchecks.

Change the published host ports with `WEB_HOST_PORT` and `API_HOST_PORT` in `.env`.

## Scripts

| Command             | Description                          |
| ------------------- | ------------------------------------ |
| `pnpm dev`          | Run all packages in development mode |
| `pnpm build`        | Build all packages                   |
| `pnpm typecheck`    | Type-check all packages              |
| `pnpm lint`         | Lint with ESLint                     |
| `pnpm format`       | Format with Prettier                 |
| `pnpm format:check` | Verify formatting                    |
| `pnpm clean`        | Remove build output                  |

## Conventions

- GitHub Flow: short-lived branches from `main`, named `<type>/<issue>-<description>`.
- Conventional Commits, in English.
- No unit-test framework during the MVP; validate with lint, typecheck, build and manual smoke tests.
- Never commit credentials. Use `.env` files (ignored by Git) and provide `.env.example` templates.
