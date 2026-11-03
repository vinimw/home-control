# Web app (`apps/web`)

Next.js (App Router) mobile-first interface, in Portuguese (pt-BR). Styling is Tailwind CSS v4 with
shadcn-style primitives (class-variance-authority + tailwind-merge + Radix) written in this repository.

## Layout and navigation

- **Phones**: bottom tab bar (56 px targets, padded for the iPhone home indicator via
  `env(safe-area-inset-bottom)`). **From `md` up**: fixed sidebar.
- `viewport-fit=cover` lets the UI extend under the notch; the header and bottom bar add safe-area padding.
  Zoom is never disabled.
- Landmarks (`header`, `nav`, `main`), a **skip link**, `aria-current` on the active item and visible focus
  rings everywhere. Motion is reduced under `prefers-reduced-motion`.
- Routes: `/` (system status), `/devices`, `/scenes`, `/settings`, `/design` (component library).
  Areas that are not built yet show an honest empty state, never fake data.

## Theming

Light and dark via CSS variables (`globals.css`) and `next-themes` (class strategy, follows the system by
default, persisted in the browser). Tokens are exposed to Tailwind with `@theme inline` (`bg-background`,
`text-muted-foreground`, `bg-primary`, `text-success`, ...). The system font stack is used, so the build
needs no network access to fetch fonts.

## Components

| Folder                | Contents                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------ |
| `components/ui`       | Primitives: `Button`, `Card`, `Badge`, `Switch`, `Slider`, `Alert`, `Skeleton`, `EmptyState`     |
| `components/controls` | Device controls: `DeviceCard`, `PowerSwitch`, `LevelSlider`, `ControlStatus`, `useDeviceCommand` |
| `components/shell`    | `AppShell`, `Sidebar`, `BottomNav`, `ThemeToggle`                                                |

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
4. **Availability is explicit.** `DeviceCard` shows `Disponível` / `Indisponível` / `Sem leitura` and
   disables its controls while the device is unavailable, explaining why.
5. **Demos never simulate success.** The `/design` controls always fail on purpose and the page says so.
6. **The status page shows real data** read from the API. If the API cannot be reached, everything is shown
   as `Indisponível` / `Desconhecido` / `—`, never as OK.

Controls receive an `ExecuteCommand` function (`(command, params) => Promise<DeviceActionResult>`). Wiring
it to the API (for example through a server-side proxy) belongs to the screens that use the controls.

## Adding a component

1. Put primitives in `components/ui` using `cva` + `cn`; keep 44 px touch targets on interactive elements.
2. Use theme tokens, not raw colors, so both themes work.
3. Give every control an accessible name (Radix slider: the label goes on the thumb, which `Slider` does
   for you via `aria-label`).
4. Add it to `/design`.

## Verification

Run `pnpm check`. Manually: `pnpm dev`, open http://localhost:3000 in a narrow window (iPhone size) and a
wide one, toggle the theme, and open `/design`.
