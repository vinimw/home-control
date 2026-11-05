# Command history and audit log

A persistent, read-only trail of what Home Control **sent to devices** and of **scene runs**. It is stored in
the SQLite database (`command_history`, migration 9), so it **survives restarts**. It is separate from the
Alexa traffic diagnostics, which is a short-lived debugging view (7 days).

## What is recorded

| Kind             | When                                                           |
| ---------------- | -------------------------------------------------------------- |
| `device_command` | Every `POST /devices/:id/actions`, and every step a scene runs |
| `scene_run`      | Once per `POST /scenes/:id/run`, with the overall outcome      |

Each entry has: `at`, `kind`, `source` (`api` = direct request, `scene` = step run by a scene), `deviceId`,
`command`, sanitized `params`, `sceneId`/`sceneName`, `runId` (ties a scene run to its steps), `outcome`,
`error` (`code` + safe message) and `durationMs`.

Outcomes: `confirmed`, `accepted`, `failed`, `partial` (scenes), and `rejected` (refused **before** anything
was sent: unsupported command, invalid params, unavailable device, actions disabled).

## Redaction

- Parameters keep only numbers, booleans and short strings of an allowlist (`source`, `key`, `app`, `mode`);
  any other value is stored as `[omitido]`. Free text, tokens and passwords are never kept.
- Error messages are the API's own safe messages (truncated to 300 chars), never raw provider responses.
- No Home Assistant URL, token, entity id or cookie is stored.
- Writing history never changes the outcome of a command: a storage failure is swallowed (counted
  internally), not retried.

## API (login required, read-only)

`GET /history` -> `{ entries, nextCursor }`, newest first.

| Query                          | Meaning                                             |
| ------------------------------ | --------------------------------------------------- |
| `kind`, `outcome`, `source`    | Exact filters                                       |
| `deviceId`, `sceneId`, `runId` | Everything about one device, scene or scene run     |
| `from`, `to`                   | ISO datetimes                                       |
| `limit`                        | 1-200 (default 50)                                  |
| `before`                       | Pass the previous `nextCursor` to get older entries |

Unknown query fields are rejected with `400`. Debugging a scene: `GET /history?runId=<run>` shows the scene
outcome and every step with its error.

## Limits

- Kept for **90 days** and at most **5000** entries; older ones are pruned automatically.
- Only commands sent through Home Control are recorded; changes made on the device itself or in Home
  Assistant are not.
- Spotify player and Alexa saved commands have their own paths and are not part of this history yet.
- There is no history screen yet; the API is the interface.
