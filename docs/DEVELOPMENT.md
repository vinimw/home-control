# Development guide (macOS)

## Fresh clone to running app

```bash
git clone git@github.com:vinimw/home-control.git
cd home-control

corepack enable            # provides the pinned pnpm version
pnpm install
pnpm env:init              # creates .env from .env.example (never committed)
pnpm dev:doctor            # optional: checks Node, pnpm, Docker, ports
pnpm build                 # builds packages/shared first, then api and web
pnpm dev                   # web on :3000, api on :3001
```

Requirements: macOS, **Node >= 22.9** (`nvm install` reads `.nvmrc`), Docker Desktop only if you use Compose.

Check it works: `curl http://localhost:3001/health` returns `{"status":"ok",...}` and
http://localhost:3000 shows `API status: ok`.

## Configuration

Configuration comes from environment variables, loaded from `.env` at the repository root in local
development (and from `compose.yaml`/`.env` in Docker). **No secrets are ever committed**: `.env` is
git-ignored and `.env.example` contains only placeholders.

The API validates its environment with a schema (`apps/api/src/config.ts`) on startup and **refuses to
start with a clear message** when something is wrong:

```
Invalid configuration:
  - API_PORT: must be between 1 and 65535
  - HOME_ASSISTANT_TOKEN: is required when HOME_ASSISTANT_URL is set
See .env.example and docs/DEVELOPMENT.md.
```

Error messages name the variable and the rule but never print values, so tokens cannot leak into logs.

| Variable                    | Service | Default                 | Notes                                                                     |
| --------------------------- | ------- | ----------------------- | ------------------------------------------------------------------------- |
| `WEB_HOST_PORT`             | compose | `3000`                  | Host port for the web container                                           |
| `API_HOST_PORT`             | compose | `3001`                  | Host port for the API container                                           |
| `API_HOST`                  | api     | `0.0.0.0`               | Fixed by Compose inside Docker                                            |
| `API_PORT`                  | api     | `3001`                  | Integer 1-65535; fixed by Compose inside Docker                           |
| `LOG_LEVEL`                 | api     | `info`                  | `fatal` to `silent`                                                       |
| `DATA_DIR`                  | api     | `./data`                | SQLite dir (locally `apps/api/data`, git-ignored); Docker: volume `/data` |
| `API_INTERNAL_URL`          | web     | `http://localhost:3001` | Server-side API URL; Docker sets `http://api:3001`                        |
| `HOME_ASSISTANT_URL`        | api     | unset                   | http(s) URL of the HA VM. Set with the token                              |
| `HOME_ASSISTANT_TOKEN`      | api     | unset                   | Long-lived token. Never exposed to the web app                            |
| `HOME_ASSISTANT_TIMEOUT_MS` | api     | `10000`                 | REST timeout, 1000-60000                                                  |

Home Assistant variables are optional for now and must be set **together**. Run `pnpm env:check` to
validate a complete setup (it requires both Home Assistant variables). The integration itself arrives in a
later task, which will make them required for the features that use them.

## Scripts

| Command                          | Description                                                       |
| -------------------------------- | ----------------------------------------------------------------- |
| `pnpm dev`                       | Build shared, then run shared (watch), api and web                |
| `pnpm build`                     | Build all packages                                                |
| `pnpm check`                     | `format:check` + `lint` + `typecheck` + `build` (run before a PR) |
| `pnpm format` / `format:check`   | Prettier write / verify                                           |
| `pnpm lint`                      | ESLint                                                            |
| `pnpm typecheck`                 | TypeScript for all packages (builds shared first)                 |
| `pnpm env:init`                  | Create `.env` from `.env.example` if missing                      |
| `pnpm env:check`                 | Validate the current environment strictly                         |
| `pnpm dev:doctor`                | Diagnose Node, pnpm, Docker, `.env` and ports                     |
| `pnpm docker:up` / `docker:down` | Compose stack up (with build) / down                              |
| `pnpm ha:check`                  | Test API container to Home Assistant connectivity                 |
| `pnpm clean`                     | Remove build output                                               |

## Troubleshooting

Start with `pnpm dev:doctor`; it flags most of the items below.

| Symptom                                                 | Cause and fix                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `Unsupported engine` / `--env-file-if-exists` not found | Node is too old. `nvm install && nvm use` (needs >= 22.9).                                                                           |
| `pnpm: command not found`                               | Run `corepack enable`. If it fails with permissions: `sudo corepack enable` or install pnpm via Homebrew.                            |
| `Cannot find module '@home-control/shared'`             | The shared package is not built. Run `pnpm build` (or `pnpm dev`, which builds it first).                                            |
| `Invalid configuration: ...` on API start               | Fix the named variable in `.env`. See the Configuration table.                                                                       |
| `EADDRINUSE` / port already in use                      | Find it: `lsof -iTCP:3001 -sTCP:LISTEN -n -P`, then stop that process or change the port in `.env`.                                  |
| On macOS, port 5000/7000 conflicts                      | Not used here. (AirPlay Receiver uses them; ports 3000/3001 are free by default.)                                                    |
| `Cannot connect to the Docker daemon`                   | Open Docker Desktop and wait until it reports running.                                                                               |
| API container keeps restarting                          | `docker compose logs api`: usually an `Invalid configuration` message. Fix `.env`, then `docker compose up -d --force-recreate api`. |
| `.env` changes ignored in Docker                        | Recreate the service: `docker compose up -d --force-recreate api`.                                                                   |
| Web shows `API status: unreachable`                     | The API is down or `API_INTERNAL_URL` is wrong. Check `curl localhost:3001/health`.                                                  |
| Build fails after switching branches                    | `pnpm clean && pnpm install && pnpm build`.                                                                                          |
| Apple Silicon: slow or wrong-arch images                | Use native `linux/arm64` images (the defaults); avoid `--platform linux/amd64`.                                                      |
| esbuild / install script warnings                       | Only `esbuild` is allowed to run build scripts (`pnpm-workspace.yaml`); this is intentional.                                         |

## Conventions

- GitHub Flow, Conventional Commits in English, branches `<type>/<issue>-<description>`.
- No unit-test framework during the MVP: validate with `pnpm check` and manual smoke tests.
