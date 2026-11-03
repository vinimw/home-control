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
