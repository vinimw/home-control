# Web app (`apps/web`)

Next.js (App Router) mobile-first interface, in Portuguese (pt-BR). Styling is Tailwind CSS v4 with
shadcn-style primitives (class-variance-authority + tailwind-merge + Radix) written in this repository.

## Layout and navigation

- **Phones**: a compact sticky top bar and a bottom tab bar (56 px targets, padded for the iPhone home
  indicator via `env(safe-area-inset-bottom)`). **From `md` up**: fixed sidebar.
- `viewport-fit=cover` lets the UI extend under the notch; the header and bottom bar add safe-area padding.
  Zoom is never disabled.
- Landmarks (`header`, `nav`, `main`), a **skip link**, `aria-current` on the active item and visible focus
  rings everywhere. Motion is reduced under `prefers-reduced-motion`.
- Routes: `/` (system status), `/devices` (live dashboard), `/scenes`, `/settings`, `/design` (component library).
  Areas that are not built yet show an honest empty state, never fake data.

## Layout rules (mobile first)

These rules exist so the app is comfortable with one thumb and does not turn into endless scrolling. New
screens must follow them (they were measured, see "Verification" below).

**Where things go**

- **Back** goes in the top bar, top-left, never at the end of a page. A sub-page registers its parent in
  `PARENT_ROUTES` (`components/shell/nav-items.ts`) and `AppHeader` shows "← Parent". The bar is sticky, so
  the back control stays in reach after scrolling. Top-level pages show the brand instead.
- **The bottom bar is only for the four top-level destinations.** No page actions in it.
- **Page-level controls** (filters, refresh) sit at the top; filters are sticky under the top bar and scroll
  sideways inside their own row instead of wrapping into several rows.
- **Destructive actions** live on the item they affect (a row button, a menu), never as a loose button at
  the end of a page. They always ask for confirmation with `ConfirmDialog`: it says what will happen and to
  what, is a bottom sheet on phones (buttons under the thumb), starts focus on **Cancelar**, closes with Esc
  or a tap outside, and the page behind is inert. See the "Ação destrutiva" demo in `/design`.

**Density**

- Page title `text-xl` on phones (`text-2xl` from `md`), `gap-4` between blocks, cards padded `p-3`.
- Anything that is only read (sensors, read-only players) is a one-line row in a shared card, not a card of
  its own. A card is for something you can operate.
- The room is the section heading, so it is not repeated inside each card. A normal device shows a small
  green dot (read out as "Disponível"); anything abnormal shows a labelled badge (`Indisponível`,
  `Sem leitura`), so state never relies on color alone.
- Command status lines take no space while idle. Several one-shot buttons share a wrapping row.
- Use `grid-cols-1` (not an implicit `auto`) for grids so a wide child cannot stretch the page.

**Touch and zoom**

- Every interactive element is at least 44 x 44 px on phones. Where the visible control is smaller (the
  28 px switch, the 24 px slider thumb) a `before:` pseudo-element extends the tappable area to 44 px.
- Button heights are minimums (`min-h-11`), so labels can wrap at large text sizes. Chips are the exception
  (`whitespace-nowrap`, in a scrolling row).
- Nothing may scroll sideways at 320 px, or at 200% text size (the bottom bar labels and the theme selector
  wrap instead of overflowing).

## Login

Every screen needs a session. The routes live in two groups: `app/(app)` (checks the session on the server
for each request, then renders the shell) and `app/(auth)/login` (no shell). An anonymous visitor is sent to
`/login`; the first visit asks for the one-time setup code from the API log and a new password. If the API
cannot be reached the session cannot be verified, so a "Servidor indisponível" page is shown instead of the
app. The session cookie is HttpOnly (the page never reads it); the CSRF token is handed to the page by the
server, kept in memory only and sent on every write. A `401` anywhere (for example after logging out on
another device) sends the browser back to `/login`. **Sair** is in the header; **Ajustes > Segurança**
changes the password. Details and limits: [SECURITY.md](SECURITY.md).

**Ajustes > Spotify** (`components/spotify/`) connects the account, lists devices and playlists and
disconnects (with `ConfirmDialog`). The browser only talks to the `/api/spotify/*` relay (a fixed allowlist of
routes and methods); `/api/spotify/callback` turns Spotify's redirect into a redirect to
`/settings?spotify=connected|denied|error`, so a code or token never reaches the page. See [SPOTIFY.md](SPOTIFY.md).

## Theming

Light and dark via CSS variables (`globals.css`) and `next-themes` (class strategy, follows the system by
default, persisted in the browser). Tokens are exposed to Tailwind with `@theme inline` (`bg-background`,
`text-muted-foreground`, `bg-primary`, `text-success`, ...). The system font stack is used, so the build
needs no network access to fetch fonts.

## Components

| Folder                | Contents                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `components/ui`       | Primitives: `Button`, `Card`, `Badge`, `Switch`, `Slider`, `Alert`, `Input`, `ConfirmDialog`, ... |
| `components/controls` | Device controls: `DeviceCard`, `PowerSwitch`, `LevelSlider`, `ControlStatus`, `useDeviceCommand`  |
| `components/shell`    | `AppShell`, `Sidebar`, `BottomNav`, `ThemeToggle`                                                 |

Open `/design` (Settings -> Components) to see every component and every command state in both themes.

## The honesty contract for controls

The UI must never claim something about a device that the device did not confirm. This is enforced by the
components, so screens built from them cannot get it wrong by accident:

1. **Controls are controlled by the device's real state.** `PowerSwitch` and `LevelSlider` take the
   reported state as a prop. There are **no optimistic updates**: toggling shows "Enviando..." and the
   switch only moves when the new state arrives.
2. **`useDeviceCommand` maps the API result 1:1** (see [DEVICES_API.md](DEVICES_API.md)):

   | API result           | UI says                                          |
   | -------------------- | ------------------------------------------------ |
   | sending              | "Enviando..."                                    |
   | `accepted`           | "Enviado, aguardando confirmação do dispositivo" |
   | `confirmed`          | "Confirmado pelo dispositivo"                    |
   | `failed` / any error | a clear pt-BR message; never treated as success  |

   `confirmed` is reachable **only** from `status: "confirmed"`. A network error is a failure.

3. **`LevelSlider` returns to the reported value** after a command that was not confirmed, so it never
   keeps showing a level the device does not have.
4. **Availability is explicit.** Every device states it: a dot read out as `Disponível`, or a badge
   `Indisponível` / `Sem leitura`. Controls are disabled while the device is unavailable, with the reason.
5. **Demos never simulate success.** The `/design` controls always fail on purpose and the page says so.
6. **The status page shows real data** read from the API. If the API cannot be reached, everything is shown
   as `Indisponível` / `Desconhecido` / `—`, never as OK.

Controls receive an `ExecuteCommand` function (`(command, params) => Promise<DeviceActionResult>`). The
devices dashboard wires it to the API through the relay described below.

## Devices dashboard (`/devices`)

`components/devices/` renders the devices from the API, grouped by room, with category filters (lights, TV and
audio, climate, scenes, sensors), a room filter and favorites.

**Data flow.** The page loads the list on the server (first paint already has real data) and the browser then
keeps it live:

1. `GET /api/devices` (list) and `GET /api/devices/events` (Server-Sent Events) are served by this app and
   relayed to the API. The browser never talks to the API directly and `API_INTERNAL_URL` never reaches it.
   Only the fixed routes under `app/api/devices` exist (list, events, `:id/actions`, `:id/settings`); the
   relay validates the device id, limits the body to 16 KB and exposes no other API path.
2. `useDevices` loads the list, opens the stream and, on every (re)connection, reloads the list before
   trusting events. A list response never overwrites a device that changed after the request started.
3. If the stream drops the badge says **Reconectando...**, a banner explains it and the list is polled every
   10 s until the stream is back (every 60 s while live, as a safety net). **Atualizar** forces a reload.
4. If the API cannot be reached, the data on screen is marked as possibly out of date (with the time of the
   last good update); with no data at all an error state offers a retry. Nothing is shown as fresh when it
   is not.

**Controls come from the device's real commands.** `DeviceTile` renders a switch only if the device offers
`turn_on`+`turn_off`, a brightness/volume slider only for `set_brightness`/`set_volume`, and so on. Everything
else the device reports (sensor readings, temperature, position, source) is read-only text. The honesty
contract above still applies: a switch moves only when the device's new state arrives (through the stream, or
from the server's view returned in the action result), never because it was clicked.

States covered: loading, API unreachable, Home Assistant not connected, no devices, no match for the filters,
and per device: available / unavailable (controls hidden or disabled) / no reading.

## Adding a component

1. Put primitives in `components/ui` using `cva` + `cn`; keep 44 px touch targets on interactive elements.
2. Use theme tokens, not raw colors, so both themes work.
3. Give every control an accessible name (Radix slider: the label goes on the thumb, which `Slider` does
   for you via `aria-label`).
4. Add it to `/design`.

## Verification

Run `pnpm check`. Manually: `pnpm dev`, open http://localhost:3000 in a narrow window (iPhone size) and a
wide one, toggle the theme, and open `/design`.

### Measured result of the mobile rework (#43)

Simulated phone viewports of 375, 390 and 360 px width (not a physical phone), same data, before -> after.
Heights are the total page height in CSS pixels at 390 px width:

| Screen       | Page height                             | Elements under 44 px | Sideways overflow at 200% text |
| ------------ | --------------------------------------- | -------------------- | ------------------------------ |
| `/devices`   | 4497 -> **2568 px** (-43%)              | 18 -> 0 real (note)  | yes -> **none**                |
| `/settings`  | 1009 -> 927 px                          | 5 -> 0               | yes -> **none**                |
| `/design`    | 2519 -> 2403 px                         | 7 -> 0 real (note)   | yes -> **none**                |
| back control | none (no way back) -> top bar, y = 2 px |                      |                                |

Note: switches and slider thumbs still measure 28 / 24 px by bounding box; their tappable area is 44 px
through a pseudo-element, verified with `elementFromPoint`. The `/devices` height depends on how many
devices have controls, so it varies with the data (this run: 19 devices, 5 of them read-only rows).
