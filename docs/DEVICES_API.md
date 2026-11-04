# Devices API

Read devices and send them actions. The API exposes a **canonical, capability-driven** model: clients
never see Home Assistant entity ids and never choose a Home Assistant service.

> **Security.** Every endpoint below needs a **login session** (HttpOnly cookie); state-changing requests
> also need the session's CSRF token in the `x-csrf-token` header. Without a session the API answers
> `401 auth_required`, and without the token `403 csrf_invalid`. See [SECURITY.md](SECURITY.md).
>
> `POST /devices/:id/actions` can also be switched off with `DEVICE_ACTIONS_ENABLED=false`
> (`403 actions_disabled`). It follows `AUTH_ENABLED` when unset, so it is on whenever a login is.

## Endpoints

| Method | Path                   | Description                                              |
| ------ | ---------------------- | -------------------------------------------------------- |
| GET    | `/devices`             | List devices. Filters: `type`, `availability`, `roomId`. |
| GET    | `/devices/events`      | Realtime stream of device changes (Server-Sent Events).  |
| GET    | `/devices/:id`         | One device.                                              |
| POST   | `/devices/:id/actions` | Execute a command the device supports.                   |

Device ids are opaque (`dev_` + 16 hex). Entity ids such as `light.sala` are not accepted and return `404`.
The device model is described in [DEVICES.md](DEVICES.md).

### `GET /devices`

```bash
curl 'http://localhost:3001/devices?type=tv'
```

```json
{
  "devices": [
    {
      "id": "dev_fa2415ebc9b9c997",
      "name": "Samsung TV",
      "type": "tv",
      "availability": "available",
      "room": { "id": "room_...", "name": "Sala" },
      "capabilities": ["power", "volume", "mute", "playback", "source"],
      "commands": [
        {
          "name": "set_volume",
          "params": [{ "name": "level", "type": "number", "min": 0, "max": 100 }]
        }
      ],
      "state": { "power": "on", "volume": 25 }
    }
  ],
  "summary": { "ready": true, "total": 19 }
}
```

`type` is one of the device types, `availability` one of `available|unavailable|unknown`. Any other
value or an unknown query parameter returns `400 bad_request`.

### `POST /devices/:id/actions`

```bash
curl -X POST http://localhost:3001/devices/dev_fa2415ebc9b9c997/actions \
  -H 'content-type: application/json' \
  -d '{ "command": "set_volume", "params": { "level": 35 }, "requestId": "5f1c" }'
```

| Field       | Required | Description                                                       |
| ----------- | -------- | ----------------------------------------------------------------- |
| `command`   | yes      | A command from the device's own `commands` list.                  |
| `params`    | depends  | Exactly the params that command declares (see its `params` spec). |
| `requestId` | no       | Idempotency key, 1-64 chars of `A-Za-z0-9_-`.                     |

No other fields are accepted. The body is limited to 16 KB.

#### Result statuses

Once an action is **executed**, the response always carries an explicit status:

| `status`    | HTTP    | Meaning                                                             |
| ----------- | ------- | ------------------------------------------------------------------- |
| `confirmed` | 200     | Home Assistant accepted it **and** the expected state was observed. |
| `accepted`  | 202     | Home Assistant accepted it, but the effect was not observed (yet).  |
| `failed`    | 4xx/5xx | The call was executed but failed. `error` explains why.             |

```json
{
  "status": "confirmed",
  "deviceId": "dev_fa2415ebc9b9c997",
  "command": "set_volume",
  "requestId": "5f1c",
  "replayed": false,
  "device": { "...": "current state" }
}
```

`accepted` is normal for commands whose result cannot be verified from state (`next_track`, `volume_up`,
`activate`, `set_color`, ...) and for slow devices (covers move gradually). Waiting for confirmation is
bounded (about 3 s) so requests never hang. `confirmed` is never reported without observing the state.

A `failed` result keeps the same body shape plus `error`, with an HTTP status that reflects the cause
(`502` Home Assistant error or rejected token, `504` timeout, `503` not connected).

#### Rejections (nothing was executed)

If the request is rejected **before** execution the body is a plain error, never a result:

```json
{
  "error": {
    "code": "unsupported_action",
    "message": "This device does not support \"turn_on\". Supported commands: turn_off, play, ..."
  }
}
```

| HTTP | `code`               | When                                                                                                 |
| ---- | -------------------- | ---------------------------------------------------------------------------------------------------- |
| 400  | `bad_request`        | Invalid JSON, wrong body shape, unknown field, bad `requestId`, bad query.                           |
| 401  | `auth_required`      | No valid session.                                                                                    |
| 403  | `csrf_invalid`       | Missing or wrong `x-csrf-token` on a state-changing request.                                         |
| 403  | `actions_disabled`   | `DEVICE_ACTIONS_ENABLED` is `false`.                                                                 |
| 429  | `too_many_requests`  | Rate limit hit (see `Retry-After`).                                                                  |
| 404  | `not_found`          | Unknown device id (including entity ids and malformed ids), unknown route.                           |
| 409  | `device_unavailable` | The device is `unavailable`.                                                                         |
| 409  | `conflict`           | `requestId` reused with a different command or params for that device.                               |
| 422  | `unsupported_action` | The command is not in this device's `commands` (the message lists what is).                          |
| 422  | `invalid_params`     | A param is missing, has the wrong type, is out of range, is not an allowed option, or is unexpected. |
| 503  | `not_configured`     | Home Assistant is not configured.                                                                    |

Error messages name the field and the rule but never echo submitted values.

## Realtime events (`GET /devices/events`)

A Server-Sent Events stream (`text/event-stream`). It is a **hint channel, not the source of truth**: a client
loads `GET /devices` first and again after every (re)connection, then applies events on top.

| Event    | `data`                                          | Meaning                                                                |
| -------- | ----------------------------------------------- | ---------------------------------------------------------------------- |
| `ready`  | `{ serverTime }`                                | The stream is open. Reload the list now (events may have been missed). |
| `device` | a full `Device` (same shape as `GET /devices`)  | One device changed: state, availability, alias, favorite or room.      |
| `resync` | `{ reason: refresh\|removed\|rooms\|settings }` | Devices were added/removed or rooms changed: reload the list.          |

- `: ping` comment lines are sent every 15 s as a heartbeat; `retry: 3000` tells the browser how long to wait.
- Events carry only the public device view: no provider identifiers.
- At most 50 streams are open at once (`429 too_many_requests` beyond that). A client that stops reading is
  disconnected instead of buffered without limit.
- The stream is read-only and, like the other `GET` endpoints, unauthenticated (see the security note).

## Aliases, favorites and rooms

The API stores the user's own metadata (see [STORAGE.md](STORAGE.md)). A device shows `name` (the alias when
set, otherwise the Home Assistant name), `sourceName` (always the Home Assistant name), `alias`, `favorite`
and `room` (the user's room when assigned, otherwise the Home Assistant area).

| Method | Path                    | Body                             | Result               |
| ------ | ----------------------- | -------------------------------- | -------------------- |
| PATCH  | `/devices/:id/settings` | `{ alias?, favorite?, roomId? }` | The updated device   |
| GET    | `/rooms`                |                                  | `{ rooms: Room[] }`  |
| POST   | `/rooms`                | `{ name }`                       | `201` + the room     |
| PATCH  | `/rooms/:id`            | `{ name?, sortOrder? }`          | The updated room     |
| DELETE | `/rooms/:id`            |                                  | `204`                |
| GET    | `/settings`             |                                  | `{ homeName }`       |
| PATCH  | `/settings`             | `{ homeName? }`                  | The updated settings |

`GET /devices` also accepts `?favorite=true|false`, and `roomId` matches the room the device is shown in.

- `PATCH /devices/:id/settings` changes only the fields sent; `null` (or a blank alias) clears a value. The
  device must currently exist (`404` otherwise), and `roomId` must be one of your rooms (`422`).
- Room names are 1-40 characters, unique ignoring case and accents (`409 conflict` on a duplicate), up to 100 rooms.
- Alias up to 60 characters; `homeName` up to 60. Control characters are rejected, unknown fields are `400`.
- Nothing here is sent to Home Assistant.

> These write endpoints are **not authenticated yet** (#26) and are enabled by default: they only change
> labels and never control a device, so the risk is limited to someone on your LAN renaming things.

## How arbitrary execution is prevented

1. The client sends a **canonical command** (`set_volume`), never a Home Assistant service or entity.
2. The command must be in `device.commands` **right now**, so what a device cannot do (for example
   `turn_on` on a TV without Wake-on-LAN) is rejected.
3. `params` are validated against that command's spec and are **strict**: every declared param is required
   and any extra key (for example `entity_id`) is rejected. String params with options are an allowlist
   (e.g. TV sources come from the device's own source list).
4. The Home Assistant service is picked from a **fixed server-side table**
   (`apps/api/src/devices/actions/adapter.ts`) and its data is built from named params only. The target
   entity comes from the server-side binding.

## Idempotency

- Absolute commands (`set_volume`, `turn_on`, `set_brightness`, ...) are naturally safe to repeat.
- Relative or toggling commands (`volume_up`, `next_track`) are not: send a `requestId`.
- With a `requestId`, repeating the same request within 60 s returns the stored outcome with
  `"replayed": true` and **does not call Home Assistant again**. Concurrent duplicates execute once.
- Reusing a `requestId` with different content returns `409 conflict`.
- **Failed** results are not stored, so the same `requestId` can be retried.
- The store is in memory (bounded, 60 s): it does not survive an API restart.

## Manual verification

```bash
# 1. log in (the API listens on localhost only); keep the cookie and read the CSRF token
CSRF=$(curl -s -c jar -X POST localhost:3001/auth/login -H 'content-type: application/json' \
  -d '{"password":"<your password>"}' | jq -r .csrfToken)

# 2. find a device and its commands
curl -s -b jar localhost:3001/devices | jq '.devices[] | {id, name, commands: [.commands[].name]}'

# 3. send a supported action, then an unsupported one (writes need the CSRF header)
curl -s -b jar -H "x-csrf-token: $CSRF" -X POST localhost:3001/devices/<id>/actions -H 'content-type: application/json' -d '{"command":"turn_off"}'
curl -s -b jar -H "x-csrf-token: $CSRF" -X POST localhost:3001/devices/<id>/actions -H 'content-type: application/json' -d '{"command":"homeassistant.restart"}'   # 422
```

## Limitations

- Single user, single role: a session can do everything. Rate limits are in-memory (see [SECURITY.md](SECURITY.md)).
- Actions are not persisted or audited (command history is a later task).
- Events are not replayed: a client that was disconnected must reload `GET /devices` (the web app does).
- Verified against a simulated Home Assistant, not a real one. Service names and the state each command
  produces follow the Home Assistant documentation; real devices may behave differently (for example a
  TV may take longer than the confirmation window, which yields `accepted`).
