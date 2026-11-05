# Media activity in the header

A compact control in the header shows what is playing on the **Echo (Alexa)** or the **Samsung TV**, with quick controls. Spotify is not
part of it: it lives on the Music page, through the direct Spotify connection. Tap it for the full list of sources.

## What you see

- **Echo:** track title and artist (when reported), state (Tocando, Pausado...) and
  anterior / play-pause / próxima.
- **TV:** the current app or input and whether it is on. Play/pause when the TV offers it and a
  **Controle remoto** shortcut to the existing remote screen. **The TV does not report the content title**,
  so none is shown (the screen says so).
- A source that is unavailable, off or without a reported state is labelled as such. A TV that is on is shown
  as _Ligada_, never as "playing" content it cannot identify.
- Every control is enabled only if the device lists that command right now. A command shows
  _Confirmado_, _Enviado, ainda não confirmado_ or _Não foi possível enviar_, and cannot be pressed twice
  while one is in flight.
- If the refresh fails, the panel says the information may be out of date.

### Which source is on top

Automatic rule: the **most recently changed source in use**, where "in use" is a source that is playing
**or a TV that is on** (a TV being watched is shown even when music is merely paused); otherwise the most
recent paused one. You can pick **Mostrar no topo** for another source (kept for the browser
session). The other sources always stay reachable in the panel, so using the Echo and the TV together never
hides one of them.

## How it works

`GET /media/activity` (login required, read-only) returns each source as `{ deviceId, name, kind, state,
title, artist, app, lastChanged, commands }`. The API reads Home Assistant's media players with **one**
`states` call cached for 2.5 s, matches them to the known devices and returns only those fields: no entity
ids, tokens or raw attributes. The header refreshes every 5 s while the tab is visible (and when it becomes
visible), so playback follows without navigating or reloading, and nothing runs in the background.
Commands use the regular device actions (`POST /devices/:id/actions`), so they are validated, audited in the
history and confirmed the same way.

## Technical discovery (checked against the real Home Assistant)

| Source            | Reports                                                            | Commands offered         |
| ----------------- | ------------------------------------------------------------------ | ------------------------ |
| Echo Show (Alexa) | State, title, artist, album while a session exists                 | play, pause, prev, next  |
| Samsung TV        | On/off, `source`/app (e.g. YouTube). `media_title` is the app name | play, pause, turn on/off |

- Alexa's playback state and track **are** readable through the Home Assistant Alexa media player, but only
  what that integration exposes; nothing here depends on an unsupported Alexa API.
- Samsung does not provide the programme or video title, so the widget cannot show it.

## Limitations

- Updates are polled every 5 s, not pushed: a change made elsewhere can take a few seconds to appear.
- The Echo's state depends on the Home Assistant Alexa integration; when it reports `unavailable` the
  source is shown as unavailable instead of guessed.
- No cover art, progress bar or volume in the header (out of scope); volume stays on the device pages.
- The widget is hidden when no media device is known at all.
- Not exercised in a browser or on a phone in this task (see the pull request).
