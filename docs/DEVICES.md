# Device registry

`apps/api/src/devices/` turns Home Assistant entities into a **canonical device model**
(`packages/shared/src/devices.ts`) so the UI and the command layer never depend on Home Assistant
details. It is an in-process module (`app.devices`); the HTTP devices API and command dispatch come with
the next tasks and will need authentication first.

## Canonical device

| Field                   | Meaning                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | Opaque and stable (`dev_` + 16 hex of a hash). Safe to persist (aliases, rooms).                                                      |
| `name`                  | User-renamed name in HA, else the friendly name, else a humanized entity id.                                                          |
| `type`                  | `light`, `switch`, `tv`, `speaker`, `media_player`, `climate`, `cover`, `fan`, `scene`, `script`, `button`, `sensor`, `binary_sensor` |
| `availability`          | `available`, `unavailable` or `unknown` (see below).                                                                                  |
| `room`                  | Area from the HA registry (entity area, else its device's area), or `null`.                                                           |
| `manufacturer`, `model` | From the HA device registry, or `null`.                                                                                               |
| `capabilities`          | What the device can do: `power`, `brightness`, `volume`, `playback`, `source`...                                                      |
| `commands`              | The **only** actions supported right now, with parameter specs.                                                                       |
| `state`                 | Normalized state (power, brightness 0-100, volume 0-100, source, readings...).                                                        |

**Provider identifiers stay on the server.** Home Assistant entity ids and attributes never appear in a
`Device`; `DeviceRegistry.resolve(id)` (server-side only) maps an id back to the entity for dispatch.

## Capability-driven commands

Commands come from what the entity advertises, never from the device model. Example: a Samsung TV
without Wake-on-LAN exposes `turn_off` but **not** `turn_on`, so the UI will not offer a button that
cannot work.

| Domain                      | Derived from                                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `light`                     | `supported_color_modes` -> brightness, color temperature (kelvin range), color                                     |
| `switch`, `input_boolean`   | always `turn_on` / `turn_off`                                                                                      |
| `media_player`              | `supported_features` bits -> power, playback, track skip, volume, mute, source (with the `source_list` as options) |
| `climate`                   | `supported_features`, `hvac_modes`, `min_temp` / `max_temp`                                                        |
| `cover`                     | open, close, stop, set position                                                                                    |
| `fan`                       | on / off, plus speed when supported                                                                                |
| `scene`, `script`, `button` | `activate`                                                                                                         |
| `sensor`, `binary_sensor`   | read-only (`reading`), no commands                                                                                 |

`media_player` with `device_class: tv` becomes `tv`; `speaker` / `receiver` become `speaker`; anything
else stays `media_player`.

## Availability

| Value         | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `available`   | Reported a usable state.                                             |
| `unavailable` | Home Assistant says it cannot reach the device (offline, unplugged). |
| `unknown`     | Exists but has not reported yet (for example right after a restart). |

Two subtleties are handled on purpose:

- **Scenes and buttons** report `unknown` until first triggered. That is not a connectivity problem, so
  they are `available`.
- Home Assistant **removes `supported_features` from `unavailable` entities**. The registry keeps the
  last known type and commands, so controls do not vanish while a device is briefly offline. A device
  that has _never_ been seen healthy since the API started has no commands until it comes online.

## What is not exposed

Counted in `ignored` and never listed:

- entities from unsupported domains (`automation`, `person`, `sun`, `weather`, `update`, ...);
- entities that are hidden, disabled, or have an `entity_category` (diagnostic or config).

Malformed data (invalid `supported_features`, non-object attributes, non-string states) never breaks a
sync: the entity falls back to safe defaults or is ignored.

Expect many `sensor` devices on a real installation; filter by `type` in the UI.

## How it stays in sync

1. **Full refresh**: states over REST, plus the entity, device and area registries over the WebSocket.
2. **Live**: each `state_changed` event updates the device in place.
3. **After a reconnect** the registry resyncs, because events may have been missed.
4. **Periodic resync** every `DEVICE_REFRESH_INTERVAL_MS` (default 5 min), since room and name changes
   do not emit state events.
5. A **new entity** is added immediately and a resync follows within seconds to pick up its room.

If a refresh fails, the previous data is kept and `lastError` is recorded.

### Admin token required for rooms

The registry commands are only available to **administrator** users. With a non-admin token the registry
still works but in `states_only` mode: no rooms or manufacturers, and hidden/diagnostic entities cannot
be filtered. Create the long-lived token with an administrator account (see `HOME_ASSISTANT.md`).

`GET /ha/status` includes a `devices` summary (counters, `enrichment`, `lastError`) and no device data.

## Limitations

- One device per entity; a physical device with several entities (a TV with `media_player`, `remote` and
  sensors) appears as separate devices. Grouping is a later improvement.
- `remote`, `lock`, `vacuum`, `humidifier` and other domains are not mapped yet.
- Verified against a simulated Home Assistant, not a real instance.
