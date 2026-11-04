# Alexa commands and Echo controls

Implements [#15](https://github.com/vinimw/home-control/issues/15) (API) and
[#16](https://github.com/vinimw/home-control/issues/16) (web). It builds on the Alexa Devices integration of
Home Assistant, which must already be connected and show your Echo (see
[HOME_ASSISTANT.md](HOME_ASSISTANT.md)).

> **What this can and cannot prove.** Home Assistant accepting a command only means the request was handed
> over. Whether Alexa understood it, and what it did, cannot be observed from here. The API therefore
> answers `accepted` or `failed`, **never `confirmed`**, and the UI tells the user to look at the Echo.

## Saved commands

A command is text **you** wrote, a name, and the Echo it is sent to. Nothing is pre-populated and nothing is
ever executed by saving, editing or selecting it. The text is interpreted by Alexa as if you had said it, so
write the phrase you want it to carry out. Known to work for this household: **"tocar Spotify"**
("abrir Spotify" only made Alexa explain what it can do). Whether "tocar Spotify" also starts playback is
**not verified**.

### Endpoints

All need a login session; writes need the CSRF header ([SECURITY.md](SECURITY.md)). Execution also follows
`DEVICE_ACTIONS_ENABLED` (`403 actions_disabled`).

| Method | Path                          | Body                        | Result                                                      |
| ------ | ----------------------------- | --------------------------- | ----------------------------------------------------------- |
| GET    | `/alexa/commands`             |                             | `{ commands }`, oldest first                                |
| POST   | `/alexa/commands`             | `{ name, text, deviceId }`  | `201` + the command. **Sends nothing.**                     |
| PATCH  | `/alexa/commands/:id`         | any of `name text deviceId` | The command. **Sends nothing.**                             |
| DELETE | `/alexa/commands/:id`         |                             | `204`                                                       |
| POST   | `/alexa/commands/:id/execute` | none (a body is ignored)    | `202 accepted`, or the failure with the status of its cause |
| POST   | `/alexa/test`                 | `{ text, deviceId }`        | Same result, `commandId: null`. **Stores nothing.**         |

- `name` 1-60 characters, `text` 1-200, no control characters, and no template syntax (`{{`, `{%`).
  At most 100 commands. Unknown fields are `400`.
- `deviceId` must be an **Echo**: a media player whose Home Assistant device is made by Amazon. Those devices
  carry the `voice_command` capability. Otherwise `422`.
- Execution re-checks the target: a deleted command is `404`, an Echo that disappeared is `404`, an
  unavailable one is `409 device_unavailable`; in these cases nothing is sent.
- Result: `{ status: 'accepted' | 'failed', commandId, deviceId, error? }`. A failed call keeps the saved
  command untouched.

### How arbitrary execution is prevented

The server always calls the single action `alexa_devices.send_text_command` with `device_id` taken from the
server-side binding of the chosen Echo and the stored text as `text_command`. The client can neither pick a
service nor another target, and the stored text of a saved command is what is sent: the body of `execute` is
ignored. The text is never written to the logs.

## Echo playback and volume

Play, pause, next, previous, volume and mute are the normal device commands: they exist **only** if Home
Assistant says the Echo supports them, and the page names the ones that are missing. No text fallback is used
(that would need its own physical verification). Their result can be `confirmed` as for any device.

## Routines

Routines you configured keep working through Home Assistant as scripts/buttons/scenes and show up as
devices with an **Ativar** button on the dashboard. A saved text command does not need one.

## Page

`/echo` (link **Comandos da Alexa** on the Echo card): playback, **Executar comando** (dropdown + button),
and **Comandos salvos** (form with **Testar comando** before **Salvar comando**, edit, delete). Testing sends
a real request and creates nothing; changing the text or Echo clears the previous test result.

## Not verified

Everything above was exercised against a **simulated** Home Assistant. The real effect of a command on the
Echo, playback after "tocar Spotify", and which playback controls your Echo exposes are for you to check and
record here:

| Check                                                 | Result |
| ----------------------------------------------------- | ------ |
| "tocar Spotify" saved and executed from the page      | ⬜     |
| Does it start playback or only open the app           | ⬜     |
| Play / pause / next / previous / volume (which exist) | ⬜     |
| A draft tested before saving                          | ⬜     |
