# Security

Home Control controls real devices, so access is protected by a **single-user login**. This page explains
what is protected, how, what is deliberately left out, and how to run it safely.

> **Scope.** The system is designed for a **home network**. It is not hardened for the open internet:
> never forward its ports on your router. For access away from home, use a VPN (for example Tailscale or
> WireGuard) instead of exposing it.

## What is enforced

| Area                 | Behaviour                                                                                                                                                                                                                                                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default deny         | **Every** API route needs a valid session, except `GET /health`, `GET /auth/session`, `POST /auth/login`, `POST /auth/setup` and the Spotify OAuth `GET /spotify/callback` (protected by a single-use state). Unknown paths also answer `401` first, so routes cannot be probed. The check lives in the API itself, so reaching the API port directly gives nothing. |
| Password             | One password, stored only as a salted **scrypt** hash (`N=32768, r=8, p=1`). Minimum 10, maximum 128 characters. Wrong guesses cost as much as right ones.                                                                                                                                                                                                           |
| Sessions             | Opaque random token (256 bits) in an **HttpOnly, SameSite=Lax** cookie (`Secure` when served over HTTPS). Only the **SHA-256** of the token is stored, so a copy of the database cannot be used to log in. Idle expiry 7 days (sliding), absolute 30 days.                                                                                                           |
| CSRF                 | Every state-changing request needs the session's CSRF token in `x-csrf-token` (constant-time compare). The web app additionally refuses requests whose `Origin` or `Sec-Fetch-Site` is not its own, and the cookie is `SameSite=Lax`.                                                                                                                                |
| Action authorization | Device actions need a session **and** CSRF **and** pass the existing allowlist: canonical commands the device advertises, strictly validated params, a fixed server-side service table. The client can never run an arbitrary Home Assistant service.                                                                                                                |
| Rate limiting        | Password attempts (login, setup, password change): 5 free failures, then a lock of 30 s doubling up to 15 min, with `Retry-After`. Authenticated writes: 120 per minute per session. Event streams: 50 at once.                                                                                                                                                      |
| Secrets              | The Home Assistant token lives only in the API's environment. It is never sent to the browser, never returned by any endpoint and is redacted from logs. The browser only talks to the web app, which relays a fixed list of routes.                                                                                                                                 |
| Logout               | Deletes the session server-side, expires the cookie and closes open event streams. Changing the password ends every **other** session.                                                                                                                                                                                                                               |
| Headers              | `Cache-Control: no-store` on API responses, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` and `frame-ancestors 'none'` on pages.                                                                                                                                                                                                                        |

## First run: creating the password

There is no default password. When the API starts without one it prints a **one-time setup code** in its
log (and nowhere else):

```bash
docker compose logs api | grep setupCode      # or read the terminal running `pnpm dev`
```

Open the web app, enter the code and choose a password. The code is random, valid until the API restarts or
a password exists, and subject to the attempt limit above. Anyone who can merely reach the web app cannot
claim the system without it.

## Forgot the password

Run on the machine that hosts the API (nothing here is reachable over the network):

```bash
docker compose exec api node --disable-warning=ExperimentalWarning dist/auth-cli.js reset-password
docker compose restart api          # prints a new setup code in the log
```

This deletes the password and **every session**; rooms, aliases and favorites are untouched. Locally:
`pnpm --filter @home-control/api exec tsx src/auth-cli.ts reset-password`.

## Configuration

| Variable                 | Default                | Meaning                                                                                                                |
| ------------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `AUTH_ENABLED`           | `true`                 | `false` turns the login off for local development. **Refused when `NODE_ENV=production`** (always so in Docker).       |
| `AUTH_COOKIE_SECURE`     | `auto`                 | `auto` marks the cookie `Secure` when the request came over HTTPS; `true`/`false` force it.                            |
| `DEVICE_ACTIONS_ENABLED` | follows `AUTH_ENABLED` | On by default now that a login exists. Set `false` for a read-only dashboard.                                          |
| `API_BIND_ADDRESS`       | `127.0.0.1`            | Host interface Docker publishes the API on. Keep it on loopback: the web app reaches the API over the Compose network. |
| `WEB_BIND_ADDRESS`       | `0.0.0.0`              | Host interface for the web app. `0.0.0.0` lets phones on your Wi-Fi connect; `127.0.0.1` keeps it on this computer.    |

**LAN-only by default.** Only the web app is published to the home network. The API is bound to
`127.0.0.1`, so another device on the network cannot talk to it. Docker Desktop publishes to the network
interface you bind; no port is opened to the internet unless **you** forward it on the router.

## Plain HTTP on the LAN: what it does and does not protect

Over `http://` (the default) the password and the session cookie travel unencrypted on your Wi-Fi. A person
on the same network could read them. The login still stops everyone who is not already on your network and
every cross-site attack, but for a shared or untrusted Wi-Fi put HTTPS in front (for example a reverse proxy
or Tailscale's HTTPS) and the cookie becomes `Secure` automatically. This is the main residual risk; see
Limitations.

## Limitations (honest list)

- **No HTTPS built in.** See above. Transport security is the operator's responsibility.
- **Single user, single role.** There is no per-user permission model; a session can do everything the
  system can do.
- **The login throttle is global, not per client.** The API only sees the web app's address, so an attacker
  who guesses wrongly locks the owner out too (for at most 15 minutes) while the attack lasts. The owner's
  existing sessions keep working. This trades a small availability risk for a hard stop against guessing.
- **In-memory counters.** Throttle and write-rate counters reset when the API restarts.
- **Sessions are not listed or revocable one by one.** Logout ends the current one; a password change ends
  all others.
- **The setup code is in the API log.** Whoever can read the log (the machine's operator) can claim a
  fresh install, by design.
- **No audit log yet** of who did what (planned: command history, #25). Login events and failures are
  written to the API log without secrets.
- **Spotify tokens** (see [SPOTIFY.md](SPOTIFY.md)) are stored encrypted (AES-256-GCM) and never reach the
  browser. The encryption key sits next to the database by default (`app-secret.key`, mode 0600) unless you
  set `APP_SECRET_KEY`: that protects a copied database file, **not** an attacker who can read the whole data
  directory or the machine. `GET /spotify/callback` is the only extra route reachable without a session; it is
  protected by a single-use `state` and only ever redirects.
- **Not independently audited.** It follows common practice and was tested against a simulated Home
  Assistant, not against a hostile network.

## How this was verified

Throwaway test suites (not committed) covered: default deny on every route including unknown paths; setup,
login, logout, password change; cookie flags; CSRF and cross-origin refusal; throttle and write rate limit;
idle and absolute expiry; persistence across an API restart; that neither the password nor the session
token appears in the database file; that the Home Assistant token and internal URL never reach the browser
bundle or any response; event streams closing after logout; and, with Docker, the published ports (API on
loopback only), the reset command and the refusal of `AUTH_ENABLED=false` in production.
