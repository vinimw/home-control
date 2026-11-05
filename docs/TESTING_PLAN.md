# Automated test foundation (plan, post-MVP)

**Status: plan only. No test infrastructure is added by this document, and the MVP ships without unit
tests** (the project convention until now). This describes how to add tests later with the least friction,
what to cover first and what must stay manual.

## Goals and non-goals

- Catch regressions in the parts that can **act on the home or leak access**: command dispatch, scenes,
  authorization/CSRF, credential handling, persistence/migrations.
- Make "accepted vs confirmed" and "never report a failure as success" provable.
- Run in seconds on the Mac and (optionally) in CI, **without real devices, Home Assistant or Spotify**.
- Non-goals: testing Home Assistant, Alexa or Samsung themselves; UI pixel tests; mandatory hardware.

## Seams that already exist (why this is cheap)

The API was built so the outside world can be replaced:

| Seam                                                                                                              | Use in tests                                               |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `buildServer(options)` + Fastify `app.inject()`                                                                   | Whole-API tests with no network port                       |
| `Storage.openInMemory()` (default storage)                                                                        | Real SQLite + real migrations, nothing persisted           |
| `homeAssistant: null` / settings                                                                                  | "Not configured" paths                                     |
| `HomeAssistantRestClient({ fetchImpl })`                                                                          | Fake HA REST (record calls, return states/errors/timeouts) |
| `SpotifyEndpoints` override in `buildServer`                                                                      | Simulated Spotify authorize/token/Web API                  |
| `confirmTimeoutMs`, `idempotencyTtlMs`, `stepTimeoutMs`                                                           | Fast tests of confirmation/timeouts/idempotency            |
| `DeviceRegistry` fed by states                                                                                    | Build devices from fixture `HassState[]`                   |
| Pure functions (`classify`, `toServiceCall`, `validateParams`, `expectationFor`, `sanitizeParams`, `pickPrimary`) | Table-driven unit tests                                    |

## Tooling recommendation

- **Runner:** Node's built-in `node:test` + `tsx` for the API and shared package. Zero new runtime
  dependency, the same TypeScript setup, and `node:sqlite` already requires Node 22. (Vitest is an
  acceptable alternative if watch mode/mocking ergonomics are wanted; decide when starting, not now.)
- **Web:** Vitest + Testing Library for components with logic (scene editor, media widget `pickPrimary`,
  room reordering). Skip snapshot tests.
- **End to end (optional, later):** Playwright against `docker compose up` with a fake Home Assistant, a
  handful of flows only (login, run a scene, reorder rooms).
- **Layout:** tests next to the code (`*.test.ts`), shared fixtures in `apps/api/test/fixtures/`, a fake
  Home Assistant in `apps/api/test/fake-ha.ts` (in-process HTTP + WebSocket server serving `states`, the
  registries and `state_changed` events, able to fail on demand).
- **Scripts:** `pnpm test` (all), `pnpm --filter @home-control/api test`; keep `pnpm check` as is and add
  `test` to it only once the suite is stable and fast (< 30 s).

## What to cover, in priority order

| #   | Area                      | Kind        | What to prove                                                                                                                                                                                                                           |
| --- | ------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Authorization and CSRF    | integration | Every route needs a session; writes need the CSRF token; the Spotify callback is the only public route; login throttle; session expiry                                                                                                  |
| 2   | Device action dispatch    | integration | Only advertised commands run; extra/missing params rejected; HA service chosen server-side; `accepted` vs `confirmed`; failures returned as `failed`; idempotency (`requestId` replay, conflict on different body, retry after failure) |
| 3   | Adapter contracts         | unit        | Per device type (TV, speaker, light, switch...): `classify` capabilities from `supported_features` fixtures; `toServiceCall` table; `expectationFor`                                                                                    |
| 4   | Scenes                    | integration | CRUD validation; steps re-validated at run; ordering; per-step timeout; partial failure; run status (`confirmed/accepted/partial/failed`); concurrent run `409`; presets omit unavailable steps                                         |
| 5   | Storage and migrations    | integration | Migrations apply in order on an empty DB; a changed shipped migration is refused; a newer DB is refused; reorder keeps ids; backups restore (`scripts/backup.sh`)                                                                       |
| 6   | Credentials and redaction | unit+integ. | Spotify tokens encrypted at rest; token never in a response or log; history `sanitizeParams`; error payloads carry no raw upstream text                                                                                                 |
| 7   | Command history           | integration | One entry per command (including `rejected`); scene run linked by `runId`; filters/cursor; survives reopening the DB                                                                                                                    |
| 8   | Spotify player            | unit        | Control checks (scope, Premium, listed/unrestricted output); accepted vs observed; 429 gate; error mapping                                                                                                                              |
| 9   | Media activity            | unit        | State mapping, TV app-name-as-title rule, source priority (TV on beats paused music)                                                                                                                                                    |
| 10  | Web logic                 | component   | Scene editor blocks unavailable steps; media widget disables unsupported controls; offline banner                                                                                                                                       |

Rule of thumb: every bug fixed after launch gets a regression test first.

## Fake Home Assistant

A small in-process server is the single most valuable asset: it lets integration tests drive
`state_changed` events (to test confirmation), return `401/404/500`, hang (timeout) and drop the WebSocket
(reconnect/resync). Fixtures should be **real captured state shapes** (names anonymized) for the TV, an Echo
and Spotify, so contract tests reflect what Home Assistant really sends. Keep the fake minimal: only the
endpoints the API uses.

## CI (optional)

A GitHub Actions workflow on pull requests, no secrets and no devices:

1. `actions/checkout`, `pnpm/action-setup`, `actions/setup-node` (Node from `.nvmrc`, pnpm cache).
2. `pnpm install --frozen-lockfile`.
3. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test`.
4. Optional job: `docker compose build` (catches Dockerfile drift).

CI must never receive `HOME_ASSISTANT_TOKEN`, Spotify credentials or `.env`. Branch protection requiring
this check is a separate decision (today merges rely on the DevFlow sweep).

## What stays manual

Real TV/Echo/Spotify behavior, pairing, sleep/auto-login and reboot recovery, the PWA install, and visual
layout on phones. These are covered by the checklists in [DEPLOYMENT.md](DEPLOYMENT.md) and the "Not
verified" notes of each pull request.

## Suggested rollout

1. Add the runner and one smoke test (`buildServer` + `GET /health`), plus `pnpm test`.
2. Fake HA + areas 1-2 (authorization, action dispatch); they guard the riskiest paths.
3. Areas 3-5, then 6-9.
4. Web component tests and, last, one or two Playwright flows.
5. Add CI once the suite is stable; then consider requiring it before merge.

## Limitations of this plan

- Not prototyped: runner choice and the fake HA are recommendations to confirm on the first step.
- `node:test` + `tsx` and the web's Vitest are two runners; accept that or standardize on Vitest everywhere.
- Coverage targets are deliberately not set; start with the priority list, not a percentage.
- The suite cannot prove real-device behavior; it only proves the code reacts correctly to what Home
  Assistant reports.
