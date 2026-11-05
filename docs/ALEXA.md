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

## Custom device cards (#52)

A **custom card** is a light/outlet on the Devices page that is controlled _indirectly_ through two saved
commands: one for **Ligar**, one for **Desligar** (for example "Ligar luminária" / "Desligar luminária").
Nothing is seeded: you create each card in the app (**Dispositivos → Cartões personalizados → Novo cartão**),
so the household values stay yours.

- Stored in `custom_devices` (migration 5): name, room, favorite and the two command ids. The command ids have
  no foreign key: deleting a saved command never deletes the card, the matching button is disabled and says why.
- Saving, editing or selecting a mapping **never sends anything**. Only a click on Ligar/Desligar does.
- `POST /custom-devices/:id/execute` takes only `{ "action": "on" | "off" }`. The server resolves the mapped
  saved command and sends its **stored** text through the same service, gate and Echo checks as
  `POST /alexa/commands/:id/execute`. The text and the target cannot come from the client.
- A second identical request while one is in flight is refused (`409`), as is a button with no mapping.
- **State is unknown.** `accepted` only means Home Assistant took the request. The card shows "Estado
  desconhecido" and the last request with its time and outcome (kept in the database), never "ligada" or
  "disponível". An unavailable Echo disables the buttons; that says nothing about the lamp itself.
- Cards appear under **Luzes e tomadas**, in their room, and honor the favorites and room filters.

Setting up the two lights from the issue (about a minute): create the four saved commands on `/echo` if they
do not exist, then create **LED churrasqueira** and **Luminária** on `/devices/custom`, picking the command
for each button.

| Physical check (pending)                 | Result |
| ---------------------------------------- | ------ |
| LED churrasqueira: Ligar turns it on     | ⬜     |
| LED churrasqueira: Desligar turns it off | ⬜     |
| Luminária: Ligar turns it on             | ⬜     |
| Luminária: Desligar turns it off         | ⬜     |

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

## System diagnostics (#58, first delivery)

Open **Alexa → Diagnóstico da Alexa** or the link in settings (`/echo/diagnostics`). The screen reads
local history only: no Alexa test, integration reload or forced provider refresh is performed. Opening
it does not require reactivating Alexa. It shows our operations and shared HA REST/WebSocket activity;
it does not count requests made internally by HA or claim a total Amazon request budget.

See [capture design and limits](ALEXA_DIAGNOSTICS_DESIGN.md) for dispatch accounting, correlation,
sanitized request/response summaries, retention, export and privacy. Raw Alexa text and response state
payloads are intentionally omitted. New history starts after deployment; older traffic is not reconstructed.
