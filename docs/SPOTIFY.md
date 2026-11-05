# Spotify

Two separate paths, on purpose:

- **Direct control (default when available).** The Music page reads the account's playback and controls it
  through the **Spotify Web API** with the direct connection: play/pause, previous/next, choosing an output
  (transfer) and starting a playlist, on whichever device is active (phone, computer, TV or Echo), with no
  Home Assistant involved. See "Direct playback control" below. It needs the connection to include the
  `user-modify-playback-state` permission (connect again once if it was made earlier).
- **Home Assistant path (kept, still works).** The official Home Assistant Spotify integration stays
  installed and untouched. The Music page falls back to it when the direct connection is missing or lacks
  the control permission, or when you choose "Usar o Home Assistant". See "Playback control through Home
  Assistant" below.

> **Status.** The direct connection and the configuration/test screen were built and checked against a
> **simulated Spotify** (a local server that mimics the authorization, token and Web API endpoints, PKCE
> included): save/validate, connect, restart-safe tokens, test results for missing permissions, free plan,
> a 403 and a revoked authorization, and Client ID changes. It has **not** been tried against the real
> Spotify with the household Premium account: that needs your own Spotify app and login. Spotify changes
> its rules often (see "Things that may differ"); the first real connection is the real test. The direct
> playback control (commands, transfer, playlist, accepted vs confirmed, 429 handling) was exercised the
> same way against the simulated Spotify, as were the library features (search paging, saved tracks,
> playlist tracks, save/remove, play from results); **real playback and the real library on the household
> account are still unverified**.

## Direct playback control (Spotify Web API)

Requires a **Premium** account (Spotify rejects playback commands from free accounts) and a connection that
includes `user-modify-playback-state`. A connection made before that permission existed keeps working for
reading; **Ajustes > Spotify > Testar conexão** lists the missing permission and **Conectar de novo** fixes it.

| Method | Path                        | Body                                                                         |
| ------ | --------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/spotify/control/state`    | Playback (track, context, active output, `disallowed`) and available outputs |
| POST   | `/spotify/control/command`  | `{ "command": "play\|pause\|next\|previous", "deviceId"? }`                  |
| POST   | `/spotify/control/transfer` | `{ "deviceId", "play"? }` (default: keep playing)                            |
| POST   | `/spotify/control/playlist` | `{ "playlistId", "deviceId"? }` (active output if none)                      |

- **Follows the active device.** Commands go to the account's active output (phone, computer, TV, Echo...)
  unless a `deviceId` is given. The screen disables a control when Spotify's `actions.disallows` says it is
  not allowed right now.
- **Accepted is not confirmed.** Spotify answers `2xx` to say it _accepted_ a command. The API then reads the
  state again (up to 3 times, 0.7 s apart) and answers `confirmed` only if the change was observed (playing
  or paused, a different track, the chosen output active, the playlist as context); otherwise `accepted`,
  and the screen says the change may still take a few seconds.
- **Actionable failures** (HTTP 409, nothing is claimed as played):

  | Code                       | Cause                                                   | Screen suggests                     |
  | -------------------------- | ------------------------------------------------------- | ----------------------------------- |
  | `spotify_no_device`        | No active output, or the chosen one is not listed       | Open Spotify on a device / pick one |
  | `spotify_restricted`       | The output is restricted, or Spotify refused the action | Choose another output               |
  | `spotify_premium_required` | Free account                                            | Premium is required to control      |
  | `spotify_scope_missing`    | Connection without the control permission               | Conectar de novo, accept all        |
  | `too_many_requests` (429)  | Spotify rate limit; carries `retryAfter` seconds        | Wait; reading pauses meanwhile      |

  Commands are checked before anything is sent: the output must be currently listed and not restricted.

- **Bounded polling.** The server reads `/me/player` and `/me/player/devices` at most once per 2 seconds
  (cached, concurrent calls share one). The Music page refreshes every 5 s **only while the tab is
  visible**, refreshes when it becomes visible again, doubles the wait after failures (up to 60 s) and, after
  a 429, waits at least the `Retry-After` it was given. While Spotify asks us to wait, the API answers
  `429` without calling Spotify at all. One command at a time (`409` otherwise).
- **No duplicate polling and no Alexa fallback.** The page uses one path at a time (direct or Home
  Assistant); nothing sends voice commands or retries by waking an Echo.

### Default path

The Music page uses the direct path when the account is connected **with** the control permission, and shows
which one is in use ("Controlando direto pelo Spotify" / "pelo Home Assistant"). **Usar o Home Assistant**
switches back (remembered in that browser). The Home Assistant integration, its credentials and automations
are never changed. Because real playback was not validated with the household account yet (see Validation
status), keep the switch in mind if something behaves unexpectedly.

### Development Mode limits

Spotify apps start in development mode: only accounts added under **User Management** can use them
(otherwise reads and commands answer `403`, shown as "o Spotify recusou o acesso"), and the number of users
and request rate are limited. Playback commands on a **restricted** device, or a device that is not
currently online in Spotify, cannot work whatever the app does.

## Your library: search, saved tracks, playlist tracks

On the Music page (direct path) the **Biblioteca** section lets you search tracks, browse your saved
("Curtidas") tracks, open the tracks of a playlist ("Ver faixas"), play a track and save or remove it. It
needs a connection that includes `user-library-read` and `user-library-modify`; an older connection keeps
working for everything else and the page asks you to connect again (**Ajustes > Spotify > Conectar de novo**,
accept all permissions; **Testar conexão** lists what is missing).

| Method       | Path                                    | Notes                                                          |
| ------------ | --------------------------------------- | -------------------------------------------------------------- |
| GET          | `/spotify/library/search?q&offset`      | Tracks. **10 per page** (Spotify's cap), `q` 1-100 chars       |
| GET          | `/spotify/library/saved?offset&limit`   | Saved tracks, newest first (up to 50 per page)                 |
| GET          | `/spotify/library/playlists/:id/tracks` | Tracks of a playlist you own or collaborate on                 |
| PUT / DELETE | `/spotify/library/saved/:trackId`       | Save / remove; the answer is what Spotify reports afterwards   |
| POST         | `/spotify/control/track`                | `{ trackId, contextUri?, deviceId? }` play a track (see below) |

- **Pagination** uses `offset`; every page returns `total` and `nextOffset` (`null` on the last page) and the
  page shows "Carregar mais" and "N de total". Search is debounced (450 ms), needs 2+ letters, and a newer
  query replaces an older response.
- **Saved status is Spotify's, not a guess.** Each page is enriched with `GET /me/library/contains` (40 URIs
  per request, Spotify's limit); after a save/remove the API asks Spotify again and returns the observed
  value, so the heart icon stays correct after a reload. If Spotify does not confirm a change the screen
  says so.
- **Play from results.** A track is played on the active output (`{ uris: [track] }`), or inside the
  playlist when opened from one (`{ context_uri, offset }`, so playback continues with the next tracks),
  with the same accepted-vs-confirmed result, error table and rate limiting as the other controls. With no
  active output the button stays disabled and explains why.
- Tracks Spotify marks unavailable (market restrictions, local files) are listed but cannot be played;
  podcast episodes and removed items inside playlists are skipped.
- **Playlists whose contents Spotify does not expose.** Since **February 2026** Spotify only returns the
  items of playlists you **own or collaborate on**; for any other playlist (including many followed or
  editorial ones) it answers `403`. The API maps that to `spotify_content_unavailable` and the screen says
  "o Spotify só compartilha as faixas de playlists que você criou ou em que colabora". Playing the whole
  playlist with **Tocar** still works.
- **Spotify API changes this follows** (checked in the official changelog): search `limit` max 10; library
  save/remove/check moved to `PUT|DELETE /me/library` and `GET /me/library/contains` (`uris=spotify:track:...`;
  the old `/me/tracks` write endpoints were removed); playlist items moved to `/playlists/{id}/items` (the
  playlist `tracks` object is now `items`, which the playlists list also reads). Spotify changes these
  often: if a request starts failing, the changelog is the first place to look.
- Rate limits, revocation and reconnect states are the same as for playback control (429 waits `Retry-After`,
  a revoked authorization asks to connect again).

## Playback control through Home Assistant

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

**Player page (`/music`, "Música" in the navigation).** Now playing, previous/play-pause/next, the list of
available outputs and the playlists with a "Tocar" button. Every control is enabled only when the
capabilities above allow it, and each part has its own loading, empty and error state. The page refreshes
`GET /spotify/player` every 5 seconds while visible; that reads one Home Assistant entity and never calls
Spotify, so there is no duplicate Spotify polling. Ajustes > Spotify keeps only the account connection and
links to the player. The direct connection (#17) is retained solely to list playlists.

**Validation status.** Verified against the real Home Assistant (read-only): entity discovery, outputs
(`MacBook Pro de Vinicius`, `Todo lugar`, `echo show`), idle capabilities, and honest refusals of
next/playlist/unknown output. **Not yet verified:** real play, pause, skip, output selection and playlist
start, because they act on your devices and need an active Spotify session. Open Spotify on a device, then
try the controls in **Ajustes > Spotify** and record the result in the pull request.

## Set it up from the app (about 5 minutes)

You do not need to edit `.env`: everything is done in **Ajustes > Spotify**.

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) with your Spotify
   account and **Create app** (tick **Web API**).
2. In **Ajustes > Spotify > Aplicativo do Spotify** copy the **Callback (Redirect URI)** shown there and add
   it under **Redirect URIs** in the dashboard, **identical, character by character**. Spotify accepts only
   `https://...` or `http://127.0.0.1:<port>/...` (not `localhost`, and not a LAN address over `http`); the
   path is always `/api/spotify/callback`. The screen validates this and explains what to do when the
   address you opened the app on is not acceptable.
3. Copy the **Client ID** from the dashboard into the form and press **Salvar**. There is no client secret:
   this uses PKCE, built for apps that cannot keep one.
4. A new app starts in **development mode**: only accounts you add under **User Management** can use it.
   Add the household account.
5. Press **Conectar Spotify**, approve on Spotify's own page (Home Control never sees your Spotify
   password) and you return to the settings page.
6. Press **Testar conexão** (see below).

### Saved configuration vs `.env`

- The Client ID and callback saved in the app (table `spotify_config`) **take precedence** over
  `SPOTIFY_CLIENT_ID` / `SPOTIFY_REDIRECT_URI`. Setups that already use the environment keep working
  untouched and show _Do servidor (.env)_; saving a value switches to _Salvo no app_.
- **Usar a configuração do servidor** deletes the saved value so the environment applies again (only shown
  when the environment has one).
- The Client ID is public (PKCE), so it is stored in plain text; **tokens stay encrypted** as described
  below. Changing the **Client ID** forgets the connected account (tokens belong to one Spotify app) and
  asks you to connect again; changing only the callback keeps it.
- `PUT /spotify/config` `{ clientId, redirectUri }` and `DELETE /spotify/config` (login + CSRF) validate on
  the server: 32 hexadecimal characters for the Client ID, and the callback rules above.

### Test connection (read-only)

`POST /spotify/test` runs six checks and never changes playback or returns a token:

| Check        | Fails when                                                          | What the screen says                                      |
| ------------ | ------------------------------------------------------------------- | --------------------------------------------------------- |
| Configuração | Nothing saved, or the callback is not acceptable                    | Save the Client ID and callback                           |
| Conexão      | Never connected, or access ended (revoked/expired)                  | "Conectar Spotify" / "Conectar de novo"                   |
| Conta        | Spotify rejects the token (also refreshes it when needed), 403, 429 | Reconnect; add the account in User Management; wait       |
| Permissões   | A read permission was not granted                                   | Lists the missing ones; "Conectar de novo" and accept all |
| Premium      | _Warning_ when the plan is not `premium`                            | Reading works, controlling playback needs Premium         |
| Dispositivos | The devices request fails                                           | Same causes as above; "no devices" is ok but explained    |

A revoked authorization marks the connection as needing reconnection (the card then offers
**Conectar de novo**) and leaves Home Assistant and its Spotify integration untouched.

### Environment variables (still supported)

```bash
SPOTIFY_CLIENT_ID=<the client id>
SPOTIFY_REDIRECT_URI=https://home.example.com/api/spotify/callback
```

Restart the API after editing (`docker compose up -d --force-recreate api`).

### HTTPS callback or loopback

- **Recommended for daily use:** a private https address in front of the app (for example a reverse proxy
  or a VPN/tailnet name with a valid certificate). Register `https://<that-name>/api/spotify/callback`.
  Do **not** forward the port on your router.
- **Setup on the host only:** open the app at `http://127.0.0.1:3000` on the computer that runs it and
  register `http://127.0.0.1:3000/api/spotify/callback`. Only the one-time connection needs that address;
  afterwards the tokens live on the server and any device can see the data.

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
  `user-read-playback-state`, `playlist-read-private`, `playlist-read-collaborative` and
  `user-modify-playback-state` (play, pause, skip, transfer, start a playlist), `user-library-read` and
  `user-library-modify` (saved tracks: browse, save, remove). Nothing else: no follows, no playlist
  edits, no streaming.

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
