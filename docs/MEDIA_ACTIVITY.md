# Media activity in the header

A compact control in the header shows what is playing on the **Echo (Alexa)**, the **Samsung TV** or **Spotify**, with quick controls.
Spotify comes from the direct Spotify connection (the same state as the Music page); the Echo and the TV
come from Home Assistant. Tap it for the full list of sources.

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

## Spotify controls in the header

When Spotify is the source on top, **anterior / pausar-tocar / próxima** appear as icon buttons right beside
the track name, without opening the panel. They are shown only for a **known track on an active output** of
a connected account that may be controlled (control permission and Premium); with no active session, after a
disconnect, with an unknown track (an ad) or when the TV or the Echo is on top, they are hidden.

- Commands are the direct Spotify commands of the Music page (`POST /spotify/control/command`): the button
  that is not allowed right now (Spotify's `disallows`) is disabled, only one command runs at a time (the
  play button shows a spinner and every button is disabled meanwhile) and the result is shown briefly under
  the header: _Confirmado_, _aceito mas ainda não visível_ or the failure (no output, restricted, rate limit...),
  never a guessed success.
- **One shared state.** The header and the Music page read the same store, with a single refresh loop (every
  5 s while the tab is visible, backing off after failures and waiting `Retry-After` after a 429; 60 s
  between checks while Spotify is not configured or connected). A command or an external pause/resume,
  track change or output change appears in both within one refresh.
- On phones the brand text is hidden so the track title stays readable next to the three buttons.

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
