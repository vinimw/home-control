# Home Assistant on macOS

Home Assistant OS (HA OS) is the device gateway of Home Control. It runs in a **virtual machine on an
always-on Mac**, separately from this repository. It is **not** part of `compose.yaml`: Docker Compose
only runs the `web` and `api` services, and the API reaches Home Assistant over the local network.

```
Docker (web + api)  ──── LAN ────►  Home Assistant OS (VM on the Mac)  ──►  TV · Echo Show
```

## 1. Prerequisites

- An always-on Mac on the same LAN as the TV and the Echo Show 8 (Ethernet strongly recommended).
- Access to the router to create a DHCP reservation.
- A VM app. This guide uses **UTM** (free). VMware Fusion and Parallels work with the same principles.

## 2. Install the HA OS VM

Follow the official guide for the exact, current image and steps:
<https://www.home-assistant.io/installation/macos>. Summary of what to choose:

1. Download the HA OS image that matches your Mac (`aarch64` for Apple Silicon, `generic-x86-64` for Intel).
2. Create a VM in UTM using **Virtualize** (Apple Silicon) or **Emulate** only if the architecture differs
   (emulation is slow; avoid it). Use UEFI boot, import the downloaded disk image, and give it at least
   **2 vCPU, 4 GB RAM and 32 GB disk**.
3. Set the network mode to **Bridged** (see section 3) before the first boot.
4. Start the VM. The first boot takes several minutes. When the console shows the HA CLI prompt,
   open `http://homeassistant.local:8123` (or `http://<vm-ip>:8123`).
5. Complete onboarding: create the owner user and set the home name, location and units.

## 3. Networking

**Use bridged networking.** The VM gets its own address on your LAN, which Home Assistant needs for
device discovery (mDNS/SSDP) of the Samsung TV and Echo Show, and for the TV to reach it.

Limitations to be aware of:

- Bridging over **Wi-Fi is often unsupported or unreliable** on macOS hypervisors. Use the Mac's
  **Ethernet** interface.
- With some hypervisors/configurations, the **Mac host cannot reach its own bridged VM**. Test
  `curl http://<vm-ip>:8123` from the Mac before continuing. If it fails, switch the hypervisor's
  bridge mode or use a dedicated USB Ethernet adapter.
- **mDNS names (`homeassistant.local`) usually do not resolve inside Docker containers**. Always use the
  VM's IP address in `HOME_ASSISTANT_URL`.
- Shared/NAT networking works for the API but **breaks device discovery**. Do not use it for production.

### Static LAN address

Reserve a fixed IP so `HOME_ASSISTANT_URL` never changes:

1. Find the VM MAC address (UTM: VM settings → Network, or Home Assistant: Settings → System →
   Network).
2. In the router, create a **DHCP reservation** for that MAC (for example `192.168.1.50`).
3. Reboot the VM and confirm it received that address.

A reservation is preferred over configuring a static IP inside HA OS, because it keeps a single source
of truth in the router.

## 4. Create the access token

The API authenticates with a **long-lived access token**:

1. Open Home Assistant and click your user (bottom-left) → **Security** tab.
2. Under **Long-lived access tokens**, click **Create token**, name it `home-control-api`.
3. **Copy it immediately**: it is shown only once.

Rules for this token:

- Create it from an **administrator** account. Rooms and manufacturers come from the entity, device and area
  registries, which Home Assistant only serves to administrators. With a non-admin token the API still
  works, but without rooms (see `DEVICES.md`).
- It lives **only** in `.env` (ignored by Git) and is loaded **only** by the `api` service. The web
  service never receives it, and it must never reach the browser.
- Never paste it in issues, PRs, logs or chat. Revoke it in the same screen if it leaks.

## 5. Configure the API

```bash
cp .env.example .env
```

Edit `.env`:

```bash
HOME_ASSISTANT_URL=http://192.168.1.50:8123   # VM IP, no trailing slash
HOME_ASSISTANT_TOKEN=<long-lived access token>
```

Recreate the API so it picks up the environment, then verify connectivity from the container:

```bash
docker compose up -d --force-recreate api
pnpm ha:check
```

Expected output:

```
Checking http://192.168.1.50:8123/api/ ...
OK: {"message":"API running."}
```

The check calls `GET /api/` with the bearer token from **inside the API container**, which proves the
real path the application will use (Docker network → LAN → VM). The realtime client connects to
`ws://<vm-ip>:8123/api/websocket` (see section 6). Once the API is running, `GET /ha/status` shows whether
both REST and the realtime connection are healthy.

## 6. How the API uses Home Assistant

The backend (`apps/api/src/homeassistant/`) owns the integration. The access token exists only in the
API process: it is never returned by any endpoint, never logged (pino redaction is a second layer) and
never reaches the browser.

- **REST client**: typed, with a per-request timeout (`HOME_ASSISTANT_TIMEOUT_MS`, default 10 s) and
  validation of entity ids and service names before building the URL.
- **Realtime client** (WebSocket): authenticates, subscribes to `state_changed`, and detects dead
  connections with ping/pong. After any interruption it **reconnects with exponential backoff and
  jitter** (about 1 s up to 30 s) and subscribes again. Consumers should resync state through REST after
  a reconnect (use `onConnectionChange`).
- **Invalid token is fatal**: the client enters `failed` and stops retrying, instead of hammering Home
  Assistant. Fix the token and restart the API.
- The API **starts even if Home Assistant is down**; it keeps retrying in the background.

| Endpoint         | Purpose                                                                 |
| ---------------- | ----------------------------------------------------------------------- |
| `GET /ha/status` | Integration snapshot (always 200): connection state, health, last error |
| `GET /ha/ping`   | Live REST probe; returns a structured error when Home Assistant fails   |

Failures use one error shape (`ApiErrorBody` in `packages/shared`):

```json
{ "error": { "code": "unreachable", "message": "Could not connect to Home Assistant" } }
```

| Code                                                  | HTTP      | Meaning                                       |
| ----------------------------------------------------- | --------- | --------------------------------------------- |
| `not_configured`                                      | 503       | `HOME_ASSISTANT_*` not set                    |
| `unauthorized`                                        | 502       | Home Assistant rejected the API's token       |
| `unreachable` / `upstream_error` / `invalid_response` | 502       | Network failure or bad answer from HA         |
| `timeout`                                             | 504       | Home Assistant did not answer in time         |
| `not_found` / `bad_request`                           | 404 / 400 | Unknown route or entity / invalid input       |
| `disconnected`                                        | 503       | Realtime connection is down                   |
| `internal_error`                                      | 500       | Unexpected failure (details only in the logs) |

`unauthorized` is a 502 on purpose: it is the API's credential towards Home Assistant that failed, not
the browser's.

## 7. Restart and recovery

- **Mac restarts**: enable auto-login for the dedicated user and add the VM start to **Login Items**
  (UTM can start a VM with `utmctl start "<vm-name>"`). Also add Docker Desktop to Login Items and keep
  `restart: unless-stopped` (already set in `compose.yaml`).
- **Sleep**: disable sleep on the Mac (System Settings → Energy → prevent automatic sleeping), otherwise
  the VM and the whole hub go offline.
- **HA updates**: use Settings → System → Updates. Create a backup first.
- **Backups**: Settings → System → Backups. Schedule automatic backups and **copy them off the Mac**
  (another disk or cloud). A backup stored only inside the VM is lost with the VM.
- **Restore**: create a fresh HA OS VM, then at onboarding choose **Restore from backup** and upload the
  backup file. The IP stays the same thanks to the DHCP reservation, so `.env` does not change; the
  long-lived token is part of the backup, but create a new one if `pnpm ha:check` reports 401.
- **VM disk**: keep a copy of the VM image after the initial setup to speed up disaster recovery.

## 8. Troubleshooting

| Symptom                                       | Likely cause and fix                                                           |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm ha:check`: `api service is not running` | Run `docker compose up -d`.                                                    |
| `HOME_ASSISTANT_URL ... must be set`          | Fill `.env`, then `docker compose up -d --force-recreate api`.                 |
| Timeout / unreachable                         | Wrong IP/port, VM stopped, or the Mac cannot reach its bridged VM (section 3). |
| `homeassistant.local` fails in the container  | Expected. Use the VM IP address.                                               |
| HTTP 401                                      | Invalid or revoked token. Create a new long-lived token.                       |
| IP changed after reboot                       | Missing DHCP reservation (section 3).                                          |
| TV/Echo not discovered                        | VM is not bridged, is on Wi-Fi bridge, or is on another VLAN/subnet.           |

## 9. Pairing devices

Pair the TV with [SAMSUNG_TV.md](SAMSUNG_TV.md). After pairing any device, run `pnpm device:probe` to see
what the API really offers for it.

## 10. Known limitations

- This setup was documented from the official procedure and was **not** verified against a real HA OS
  VM in this repository's CI; confirm each step on your hardware.
- A single Mac is a single point of failure for the whole hub.
- Remote access (outside the LAN) is out of scope for the MVP.
