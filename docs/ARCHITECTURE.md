# Architecture

## Goals

A local-first hub to control a Samsung TV, an Echo Show 8 and Spotify Premium from a single
responsive web app, using Home Assistant as the device gateway.

## Components

```
Browser (apps/web, Next.js)
        │  HTTP / WebSocket
        ▼
apps/api (Fastify)  ── SQLite (settings, rooms, aliases, history)
        │  REST + WebSocket (backend only)
        ▼
Home Assistant (separate macOS VM)  ──►  Samsung TV · Echo Show 8 · Spotify
```

- **apps/web**: UI only. Never talks to Home Assistant or third parties directly.
- **apps/api**: the single backend. Holds every credential and token, exposes a
  capability-aware devices API and orchestrates scenes.
- **packages/shared**: TypeScript contracts (DTOs, capability types, API paths) shared by both apps.
  It is compiled to `dist/`, so `shared` must be built before `api` and `web` are type-checked or built
  (the root scripts handle this).
- **Home Assistant**: runs outside this repository, in a macOS VM. SQLite lives in a persistent
  API volume.

## Containers

- One multi-stage Dockerfile per app (`apps/api/Dockerfile`, `apps/web/Dockerfile`), built from the
  repository root. Final images are `node:22-alpine`, non-root, with healthchecks.
- API image is slimmed with `pnpm deploy --legacy --prod`; web uses Next.js `output: 'standalone'`.
- `compose.yaml` wires `web` -> `api` over the Compose network (`API_INTERNAL_URL=http://api:3001`),
  starts `web` only after `api` is healthy, and mounts the `api-data` volume at `/data`.
- `.env` (ignored by Git) is loaded by the API service only; `.env.example` is the template.

## Principles

1. **Capability-driven control**: the UI renders controls from the capabilities a device reports,
   never from hard-coded device models.
2. **Backend-only credentials**: tokens and secrets never reach the browser or Git.
3. **Local first**: the system must work on the home network without cloud dependencies of its own.
4. **Small independent increments**: each issue delivers one feature behind a stable contract.

## Roadmap

Tracked in the GitHub Project "Home Control" (Foundation, Home Assistant, Samsung, Echo Show,
Spotify, Scenes, Security/PWA, Deployment).

## Tooling decisions

- pnpm workspaces, Node >= 22, TypeScript strict (`tsconfig.base.json`).
- ESLint (flat config) + Prettier.
- Build scripts of dependencies are blocked by default; only `esbuild` is allowed
  (`onlyBuiltDependencies` in `pnpm-workspace.yaml`).
- TypeScript is pinned to 5.9 because `typescript-eslint` does not yet support 7.x.
