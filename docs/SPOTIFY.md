# Spotify

Two separate paths, on purpose:

- **Playback control** (play/pause/next/previous, choosing the output, starting a playlist) goes through the
  **official Home Assistant Spotify integration**: Home Control -> API -> Home Assistant -> Spotify. No extra
  Spotify permission, OAuth connection or polling is needed. See "Playback control" below.
- **Reading your account** (playlists, devices, now playing) uses the direct, **read-only** connection from
  the sections that follow. It stays only because Home Assistant cannot browse playlists while idle (see
  below); it never changes playback.

> **Status.** Everything below was built and tested against a **simulated Spotify** (a local server that
> mimics the authorization, token and Web API endpoints, including PKCE checks). It has **not** been tried
> against the real Spotify: that needs your account and your own Spotify app. Spotify changes its rules often
> (see "Things that may differ"); the first real connection is the real test.

## Playback control (through Home Assistant)

Requires the official Spotify integration in Home Assistant (entity `media_player.spotify_*`, found
automatically). Commands target that one entity; the browser never chooses an entity or a service.

| Method | Path                       | Body                                           |
| ------ | -------------------------- | ---------------------------------------------- |
| GET    | `/spotify/player`          | State, available outputs and **capabilities**  |
| POST   | `/spotify/player/command`  | `{ "command": "play\|pause\|next\|previous" }` |
| POST   | `/spotify/player/source`   | `{ "source": "<output name from the list>" }`  |
| POST   | `/spotify/player/playlist` | `{ "playlistId": "<Spotify playlist id>" }`    |

- **Capabilities come from Home Assistant's `supported_features`, never assumed.** Verified on the installed
  Home Assistant: while Spotify has no active session the entity is `idle` and only exposes
  `select_source`. Play/pause/next/previous/`play_media` and `browse_media` (answers `not_supported`) appear
  only once an output is active. A command that is not offered is refused with `422 unsupported_action`
  before anything is sent.
- **Outputs** are the entity's `source_list` (Spotify Connect devices currently available: phone, computer,
  TV, Echo...). Choosing one that is not listed returns `409 device_unavailable`. Control is not restricted
  to Echo.
- **Accepted vs confirmed.** The result is `confirmed` only when the expected state was observed within a few
  seconds; otherwise `accepted` (Home Assistant took it, Spotify did not confirm yet).
- **No Alexa fallback** and no retry/wake loops.
- Calls to Home Assistant appear in the existing diagnostics (observed Home Control -> Home Assistant calls,
  not Home Assistant -> Spotify requests).
- **Direct connection from #17 is kept for reading playlists only**: Home Assistant cannot browse them while
  idle. It performs no playback calls. Playing a playlist goes through Home Assistant `play_media`
  (`spotify:playlist:<id>`), which also requires an active output.

**Validation status.** Verified against the real Home Assistant (read-only): entity discovery, outputs
(`MacBook Pro de Vinicius`, `Todo lugar`, `echo show`), idle capabilities, and honest refusals of
next/playlist/unknown output. **Not yet verified:** real play, pause, skip, output selection and playlist
start, because they act on your devices and need an active Spotify session. Open Spotify on a device, then
try the controls in **Ajustes > Spotify** and record the result in the pull request.

## Set it up (about 5 minutes)

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) with your Spotify
   account and **Create app**.
2. **Redirect URI**: add exactly `http://127.0.0.1:3000/api/spotify/callback` (use your web port if it is not
   3000). Spotify does **not** accept `localhost`; it accepts `https` or the loopback IP `127.0.0.1`.
3. Under **APIs used**, tick **Web API**. Save.
4. Copy the **Client ID**. You do **not** need the client secret: this uses the PKCE flow, which is built for
   apps that cannot keep a secret.
5. In `.env`:

   ```bash
   SPOTIFY_CLIENT_ID=<the client id>
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/spotify/callback
   ```

6. Restart the API (`docker compose up -d --force-recreate api`), open **`http://127.0.0.1:3000`** (see the
   note below), log in, go to **Ajustes > Spotify** and press **Conectar Spotify**.
7. A new app starts in **development mode**: only accounts you add under **User Management** in the
   dashboard can use it. Add your own account.

### Why `127.0.0.1` and not the usual address

Spotify sends the browser back to the redirect URI, so the browser must reach it. The session cookie belongs
to the host name you logged in on: if you log in at `http://192.168.0.10:3000` or `localhost` and Spotify
sends you back to `127.0.0.1`, that is a different site to the browser and you will be asked to log in again
(then press Conectar once more). **Connect from the computer that runs Home Control, at
`http://127.0.0.1:3000`**. This is only needed for the one-time connection; afterwards the tokens live on
the server and any device can see the data.

## How it works

- **Authorization Code with PKCE.** `POST /spotify/connect` (needs your login) creates a one-time `state` and a
  PKCE challenge and returns Spotify's authorize URL. After you approve, Spotify redirects the browser to
  `/api/spotify/callback`; the web app hands `code` and `state` to the API, which checks that the `state` is
  one it issued (single-use, 10 minutes, at most 10 pending), exchanges the code and stores the result.
  The browser only receives a redirect to `/settings?spotify=connected|denied|error`: never a token, a code
  or an error detail.
- **Tokens stay on the server.** They are stored **encrypted** (AES-256-GCM) in SQLite. The key is **not** in
  the database: it comes from `APP_SECRET_KEY` (base64, 32 bytes: `openssl rand -base64 32`) or, when unset,
  from a random file `app-secret.key` (mode 0600) created once in the data directory. A copy of the database
  file alone is therefore useless. If the key is lost, nothing breaks: the card asks you to connect again.
- **Refresh.** The access token is refreshed automatically a minute before it expires, once at a time however
  many requests are waiting, and retried once if Spotify rejects it early. If Spotify says the authorization is
  no longer valid (you removed the app, or it expired) the API stops calling Spotify and the card says
  **"O acesso ao Spotify terminou. Conecte de novo"** with a button. Nothing is shown as connected when it
  is not.
- **Least privilege.** Scopes requested: `user-read-private` (account and Premium status),
  `user-read-playback-state`, `playlist-read-private`, `playlist-read-collaborative`. Nothing that can modify.

## API (all need a login; `POST`s also need the CSRF token)

| Method | Path                  | Description                                                                                 |
| ------ | --------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/spotify/status`     | Configured? connected? account, plan (`premium`...), granted scopes, last error. No tokens. |
| POST   | `/spotify/connect`    | Returns `{ authorizeUrl }`. `503 not_configured` without the env vars.                      |
| GET    | `/spotify/callback`   | Spotify's redirect target. **No session** (see below). Always answers a redirect.           |
| POST   | `/spotify/disconnect` | Forgets the account and deletes the stored tokens (`204`).                                  |
| GET    | `/spotify/playlists`  | First 50 playlists (`id`, `name`, `tracks`, `owner`, `imageUrl`) and the account `total`.   |
| GET    | `/spotify/devices`    | Spotify Connect devices (`name`, `type`, `isActive`, `isRestricted`, `volumePercent`).      |
| GET    | `/spotify/playback`   | What is playing, or `{ "playback": null }` when nothing is.                                 |

`/spotify/callback` is the one route reachable without a session, because the browser arrives from Spotify
and the session cookie may not be sent. It is protected by the single-use `state`. A forged or replayed
request changes nothing and never reaches Spotify's token endpoint.

Errors: `409 spotify_connect_required` (not connected or must reconnect), `502 spotify_forbidden`,
`429 too_many_requests` (Spotify is limiting), `502 upstream_error`, `503 not_configured`, plus the usual
`unreachable` / `timeout`. Messages never include Spotify's raw responses.

## Limitations that come from Spotify (read this)

- **Premium is required to control playback**, not to read. This task only reads, so a free account can see
  devices and playlists; the card says so when the plan is not `premium`.
- **A "target" must be a Spotify Connect device that is online.** `GET /spotify/devices` only lists devices that
  are currently active in Spotify. A device that is off or has never opened Spotify is missing, and a device
  marked `isRestricted` will not accept playback commands. Later tasks must show this instead of pretending a
  command worked.
- **Whether the Samsung TV and the Echo Show appear as Connect devices is not verified.** Spotify's TV app and
  Alexa-linked speakers usually do, but this was not tried with your devices.
- **Only the first 50 playlists** are listed (the card shows "Mostrando 50 de N").
- **Development mode** apps only work for accounts added in the dashboard, and Spotify has been tightening
  these rules (user limits, requirements on the app owner). If the dashboard asks for something not described
  here, follow the dashboard. A `403` from Spotify is reported as "o Spotify recusou o acesso" with this hint.
- Spotify rate-limits by app; a `429` is passed on honestly with the wait it asked for.

## Things that may differ from this guide

Spotify's redirect URI rules, development-mode limits and endpoint availability have changed several times.
This guide follows the documentation as known at the time of writing and was **not** re-checked against the
live service. If something does not match, the Spotify dashboard and [developer docs](https://developer.spotify.com/documentation/web-api)
win: please tell us so this page can be corrected.

## Troubleshooting

| You see                                                  | Likely cause                                                                                          |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "O Spotify ainda não foi configurado"                    | `SPOTIFY_CLIENT_ID` / `SPOTIFY_REDIRECT_URI` missing; restart the API after editing `.env`.           |
| Spotify page says "INVALID_CLIENT: Invalid redirect URI" | The URI in the dashboard differs from `SPOTIFY_REDIRECT_URI` (it must match character for character). |
| Back at the login screen after approving                 | You started on another host name; connect from `http://127.0.0.1:3000` (see above).                   |
| "O Spotify recusou o acesso"                             | Your account is not under **User Management** of the app (development mode), or a scope is missing.   |
| "O acesso ao Spotify terminou"                           | You removed the app at spotify.com/account/apps, or the key file was lost: press Conectar de novo.    |
| Devices list is empty                                    | Open Spotify on a device (or wake the TV/speaker) so it shows up as a Connect target.                 |
| The API refuses to start: `SPOTIFY_REDIRECT_URI`         | It must be `https` or `http://127.0.0.1:<port>/...`.                                                  |

## Disconnecting

**Ajustes > Spotify > Desconectar** deletes the stored tokens here. To also revoke the app on Spotify's side,
remove it at <https://www.spotify.com/account/apps/>.
