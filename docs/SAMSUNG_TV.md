# Samsung Q80A (QN55Q80AAGXZD) with Home Assistant

> **Status: procedure documented; real-device results NOT recorded yet.**
> Pairing a TV and controlling it needs the physical TV and your Home Assistant, which cannot be done from
> this repository. Every result below is empty (`⬜`) on purpose. Fill them by running the steps and the
> probe on your hardware. Nothing in this page is a verified fact about the TV until you record it.

Official reference for the integration: <https://www.home-assistant.io/integrations/samsungtv/>. Menu names
vary between firmware versions; where this guide names a menu it is a hint, not a guarantee.

## 1. Before you start

- Home Assistant is running and reachable by the API (`pnpm ha:check` is OK, see [HOME_ASSISTANT.md](HOME_ASSISTANT.md)).
- The TV and Home Assistant are on the **same LAN/subnet**. Ethernet is the most reliable for power-on; Wi-Fi
  can work but must be tested (section 4).
- Reserve a fixed IP for the TV in the router (DHCP reservation), like the Home Assistant VM.
- The API token belongs to an **administrator** (needed for rooms and manufacturers, see [DEVICES.md](DEVICES.md)).

## 2. Prepare the TV

On the TV, check (names may differ on your firmware):

1. **Network standby / Power on with mobile**: allows the TV to be woken over the network. Often under
   Settings -> General -> Network -> Expert Settings. Required for `turn_on`.
2. **External device access**: the TV must accept connection requests from new devices (Device Connection
   Manager / Access Notification). If a previous pairing was denied, clear it here.
3. Keep the TV **on** during pairing: it shows an authorization prompt.

## 3. Pair with Home Assistant

1. Turn the TV on and keep the remote at hand.
2. Home Assistant -> Settings -> Devices & services. If the TV was discovered, click **Configure**;
   otherwise **Add integration** -> **Samsung Smart TV** and enter the TV's IP address.
3. **Accept the prompt on the TV screen** when it appears (it times out after a short while; repeat if it did).
4. Finish the wizard, give the device a name and a room.
5. Open the new device in Home Assistant and note its entities (see the results section).

If pairing fails: confirm the TV is on and reachable (`ping`), that nothing blocks the TV's ports between
VLANs, that external device access is allowed (section 2), and retry. Remove a stale entry before re-adding.

## 4. Verify power-on separately

Turning a TV **off** is easy; turning it **on** is the fragile part, so test it on its own and record each
case. The API only offers `turn_on` if Home Assistant advertises it for the device.

| Case                                   | How to test                                      | Result |
| -------------------------------------- | ------------------------------------------------ | ------ |
| Off for 1 minute (network standby)     | Turn off, wait 1 min, send `turn_on`             | ⬜     |
| Off for 1 hour                         | Turn off, wait 1 h, send `turn_on`               | ⬜     |
| Off overnight                          | Turn off, leave it, send `turn_on` next morning  | ⬜     |
| After a power cut (unplugged for 30 s) | Unplug, replug, leave in standby, send `turn_on` | ⬜     |
| Wi-Fi vs Ethernet                      | Repeat the first case on each connection         | ⬜     |

If `turn_on` is **not offered** by the API, that is the correct, honest outcome: the UI must not show a
power-on button for this TV, and the TV must be switched on manually or by remote.

## 5. Probe the real device

```bash
pnpm build
# The API requires a login: give the probe your password through the environment
# (not on the command line, where it would stay in your shell history)
export HOME_CONTROL_PASSWORD='...'

# 1. read-only: capability matrix, nothing is sent to the TV
pnpm device:probe --type tv

# 2. guided control (volume/mute round trips, restores the original values)
#    needs device actions enabled (they are on by default when the login is on)
pnpm device:probe --type tv --execute

# 3. disruptive: re-selects the current source and powers the TV OFF (and back on if offered)
pnpm device:probe --type tv --execute --disruptive --out samsung-q80a-probe.md
```

Use `--name` or `--device <id>` if several TVs are found. Without `--execute` nothing is sent. The probe
prints a Markdown report with:

- the **commands the API offers** and their parameters (for example the real list of sources);
- the **commands NOT offered**, which are explicitly excluded: they return `422 unsupported_action`;
- for each control step: the API status (`accepted`, `confirmed`, `failed` or `NOT OFFERED`), HTTP code,
  latency and the state change Home Assistant reported.

### Read the results correctly

`confirmed` means **Home Assistant reported the expected state**. For many TVs the state is polled or
assumed, so this does not prove the screen did what you asked. **Watch the TV** and write what actually
happened in the last column (`✅` / `❌` + a note). Only that column counts as verified.

## 6. Privacy: what must never be committed

- The TV's **serial number**, MAC address and IP address, the Home Assistant token and any account data.
- The probe masks MAC addresses, IPv4 addresses and `serial ...` values in its output, but **review any
  report before committing it**; masking is a safety net, not a guarantee.
- Entity ids (for example `media_player.<name>`) are not secrets and may be recorded below. The API itself
  never exposes them to clients.

## 7. Not supported yet (explicitly excluded)

- **Navigation keys** (d-pad, OK, back, home, menu): Home Assistant exposes them through the `remote`
  entity, which the canonical device model does not map yet. They are not offered and must not appear in the
  UI until the Samsung adapter task adds them.
- Any command the probe lists under _Commands NOT offered_ for your TV.
- Power-on when the API does not offer `turn_on` (section 4).

## 8. Results (fill in from your TV)

### Environment

| Item                                       | Value |
| ------------------------------------------ | ----- |
| Date                                       | ⬜    |
| Home Assistant version                     | ⬜    |
| TV firmware (Settings -> Support -> About) | ⬜    |
| Connection (Wi-Fi / Ethernet)              | ⬜    |
| Integration used                           | ⬜    |

### Entities created in Home Assistant

| Domain         | Entity id | Notes |
| -------------- | --------- | ----- |
| `media_player` | ⬜        |       |
| `remote`       | ⬜        |       |
| other          | ⬜        |       |

### Capability matrix (real device)

"Offered by API" comes from the probe; "Works on TV" is what you observed.

| Capability / command            | Offered by API          | Works on TV (observed) | Notes                     |
| ------------------------------- | ----------------------- | ---------------------- | ------------------------- |
| Power off (`turn_off`)          | ⬜                      | ⬜                     |                           |
| Power on (`turn_on`)            | ⬜                      | ⬜                     | see section 4             |
| Volume set (`set_volume`)       | ⬜                      | ⬜                     |                           |
| Volume step (`volume_up/down`)  | ⬜                      | ⬜                     |                           |
| Mute (`set_mute`)               | ⬜                      | ⬜                     |                           |
| Play / pause / stop             | ⬜                      | ⬜                     |                           |
| Next / previous                 | ⬜                      | ⬜                     |                           |
| Source select (`select_source`) | ⬜                      | ⬜                     | list the real sources: ⬜ |
| Navigation keys                 | not offered (section 7) | ⬜                     |                           |

### Manual control results

Paste the table printed by `pnpm device:probe --execute` here (after reviewing it for identifiers) and fill
in its last column.

⬜ _not recorded yet_
