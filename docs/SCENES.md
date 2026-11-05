# Scenes

A scene is a saved, ordered list of device actions that runs with one request. This task is the **backend
engine**; the scenes screen in the web app comes later.

## Safety model

- A step is `{ deviceId, command, params? }`: a **canonical command** from the device's own `commands`
  list (the same ones as `POST /devices/:id/actions`). It is **never** a Home Assistant domain, service or
  entity, so the frontend cannot make the server run an arbitrary Home Assistant call.
- Steps are validated when saved (device exists, command is advertised, params are valid) and **validated
  again when run**, because devices change. A scene whose device disappeared still exists; that step fails.
- Running needs `DEVICE_ACTIONS_ENABLED=true`, like any device action. The run body is empty: the client
  only says _which_ scene, never _what_ to execute.

## API (login required; `POST`/`PATCH`/`DELETE` also need the CSRF token)

| Method | Path              | Description                                                           |
| ------ | ----------------- | --------------------------------------------------------------------- |
| GET    | `/scenes`         | All scenes with their last run                                        |
| POST   | `/scenes`         | `{ "name", "steps": [...] }` (1-20 steps, at most 50 scenes) -> `201` |
| PATCH  | `/scenes/:id`     | Change `name` and/or `steps`                                          |
| DELETE | `/scenes/:id`     | Delete (`204`)                                                        |
| POST   | `/scenes/:id/run` | Run the steps in order; answers with per-step results                 |

Invalid input is `400 bad_request` or `422 invalid_params` (the message names `steps.<n>`).

## Running

Steps run **one after another**. A step that fails (or times out after 15 s) is recorded and the next
step still runs. `POST /scenes/:id/run` answers `200` with:

```json
{
  "status": "partial",
  "at": "...",
  "steps": [
    {
      "index": 0,
      "deviceId": "...",
      "command": "turn_on",
      "status": "confirmed|accepted|failed",
      "error": { "code": "...", "message": "..." },
      "durationMs": 120
    }
  ]
}
```

| Run status  | Meaning                                                        |
| ----------- | -------------------------------------------------------------- |
| `confirmed` | Every step's expected state was observed.                      |
| `accepted`  | Nothing failed, but at least one step was not confirmed (yet). |
| `partial`   | Some steps worked and some failed.                             |
| `failed`    | No step worked.                                                |

A failed step is never reported as success. The most recent run is stored with the scene (`lastRun`). A
scene that is already running answers `409 conflict`.

## Preset scenes (Cinema, Boa noite, Música)

Ready-made starting points built only from what the connected TV, Echo and Spotify support right now.
They are **installed on request** (nothing is created automatically) and become ordinary scenes, so they are
fully editable (`PATCH /scenes/:id`) and removable.

| Method | Path                           | Description                                                           |
| ------ | ------------------------------ | --------------------------------------------------------------------- |
| GET    | `/scenes/presets`              | Each template with its steps resolved to real devices, or why not     |
| POST   | `/scenes/presets/:key/install` | `cinema`, `good_night` or `music`; `201` with the scene and `omitted` |

- **Cinema:** TV on, TV volume 20%. **Boa noite:** TV off, pause Spotify, pause Echo.
  **Música:** play Spotify on the active output, Echo volume 30%.
- A step is included only if the device is available **and** advertises the command at that moment. Others
  are left out and listed in `omitted` with the reason (for example Spotify cannot pause while idle). A
  missing or unsupported device never blocks the scene; if nothing is available the install answers
  `409 device_unavailable` and creates nothing.
- Installing a name that already exists answers `409 conflict`; the existing scene is untouched.
- **Lights are deferred:** the Nova Digital bulb has no steps. Add light steps by editing the scene once
  the device is supported.
- Results are reported by the same run logic as any scene (`confirmed`, `accepted`, `partial`, `failed`).

## Limitations

- No delays, conditions, or "stop on first error" yet: every step is attempted.
- Spotify and Alexa saved commands are not step types yet; only device commands.
- The scenes page in the web app is still a placeholder.
