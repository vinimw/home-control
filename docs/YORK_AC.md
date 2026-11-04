# York air conditioner (YHHE18C3I1): IR integration study

> **What this is.** A desk investigation, written for the owner of the unit. **No hardware was bought, tested
> or touched.** Everything about _this exact model_ is **unverified**: the research found almost nothing
> published about it. Where a statement comes from a source, it is linked; where it is an inference, it says
> so. Nothing here needs to be built for the MVP.

## 1. Short answer

| Question                                               | Answer                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Can Home Assistant control an IR-only air conditioner? | **Yes, in general**, with an IR transmitter ("bridge") and a climate integration (section 4).        |
| Is it confirmed for the **YHHE18C3I1**?                | **No.** No spec sheet, remote model or IR protocol for it was found. It must be checked on the unit. |
| Will Home Control know if the AC is really on?         | **Not reliably.** IR is one-way; the state is _assumed_ from the last command (section 5).           |
| Does it need hardware?                                 | **Yes, optional and cheap relative to the AC**: an IR bridge, ideally also a power-monitoring plug.  |
| Needed for the MVP?                                    | **No.** Nothing is bought or built now (acceptance criterion).                                       |

**Recommendation.** Treat it as _feasible but unproven_. Before buying anything, spend ten minutes on the
checks in section 3: they decide which option works. If you do buy something, start with the cheapest
reversible experiment (one IR bridge, learn a few codes, see whether the AC obeys and whether the codes carry
the whole state) and keep the rest of the system independent of it.

## 2. What is actually known about the unit

Only a retailer listing was found: [Ar Condicionado Split 18000 BTU Quente/Frio - Inverter - YORK - 220v -
YHHE18C3I1](https://webarcondicionado.com.br/produto/ar-condicionado-split-18000-btu-quente-frio-inverter-york-220v-yhhe18c3i1)
describes it as an **18,000 BTU, hot/cold (heat pump), inverter split, 220 V**. A page for the cooling-only
sibling (YHCE18C3I1) lists a remote control but gives no protocol.

**Not found, and therefore unknown:** the remote's model, the IR protocol, whether the indoor unit has a
Wi-Fi/serial port or accepts a manufacturer module, the refrigerant, the efficiency rating, and a York
manual or spec sheet. One search also suggested that some Midea-family products (and York-branded ones) share
platforms ([source](https://github.imc.re/rysiulg/Midea-heat-pump-ESPHome)), but that concerned heat pumps
over Modbus, **not** this split and **not** infrared. It is a hint to check, not a fact about this unit.

## 3. Checks to do on the real unit (no purchase needed)

1. **Read the labels.** Photograph the indoor unit's label (full model, e.g. `YHHE18C3I1` plus the indoor
   and outdoor codes) and the **remote's model** (usually printed in the battery compartment). The remote
   model is the key to every IR database below.
2. **Look for a connector or a "Wi-Fi" mention** in the manual and on the indoor unit (a small port or
   cover). If York sells a Wi-Fi module for this line, that is a different, probably better path
   (section 4, option D). Ask York support for the compatible-module list and the communication type
   (infrared, UART or Modbus).
3. **Check the remote is IR.** Point it at a phone camera: a working IR remote shows a flickering purple
   light when a key is pressed. (A Bluetooth/RF remote would make this whole study moot.)
4. **Does one IR frame carry the whole state?** Many air conditioner remotes send _temperature, mode, fan
   and power together_ in every press, which makes absolute commands ("on, cool, 24") possible. Some send a
   bare **power toggle**, which is the dangerous case for state (section 5). This is learned by
   experiment, not from the internet.
5. **Is there line of sight?** The bridge must see the indoor unit's receiver window.

## 4. Integration options

| Option                                                                 | What you need              | Climate entity in Home Assistant?                                                                                                                                                                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Broadlink IR bridge** (RM4 mini and similar)                      | The bridge on your Wi-Fi   | Not by itself: [the integration](https://www.home-assistant.io/integrations/broadlink/) learns and sends codes (`remote.learn_command`, `remote.send_command`) and creates climate entities **only for supported thermostats**. | Local polling. Codes are stored in `.storage`. Combine with **SmartIR** for a `climate` entity.                                                                                                                                                                                                                                                                                          |
| **A+. SmartIR** on top of A                                            | A device code file         | Yes. [SmartIR](https://github.com/smartHomeHub/SmartIR) turns learned/known IR codes into a `climate` entity (modes, fan, temperature) and supports Broadlink, Xiaomi, LOOKin, ESPHome and MQTT as senders.                     | A custom component (HACS), not core. It ships 120+ climate device files "mostly for Broadlink"; **whether one matches this York was not found**, so you would **learn and write your own** code file. The [climate docs](https://raw.githubusercontent.com/smartHomeHub/SmartIR/master/docs/CLIMATE.md) offer an optional `power_sensor` (section 5).                                    |
| **B. ESPHome IR transmitter** (DIY: ESP32 + IR LED, optional receiver) | Parts and some soldering   | Yes, through ESPHome's [IR climate](https://esphome.io/components/climate/climate_ir.html).                                                                                                                                     | Supported brands there include Midea, Gree, Daikin, Coolix, LG, Fujitsu General, Mitsubishi, Toshiba, Whirlpool and others, but **not York**, and the generic HeatpumpIR library is described as unofficial. The optional receiver can notice the _original remote_ being used.                                                                                                          |
| **C. Home Assistant native Infrared**                                  | An ESPHome IR proxy        | Not for air conditioners today                                                                                                                                                                                                  | [2026.4](https://www.home-assistant.io/blog/2026/04/01/release-20264/) introduced an Infrared building block (send); receive was reported in the 2026.6 beta (a community post, **not confirmed in final notes**). It is used by brand-specific integrations (the first were TV makers), so it does **not** by itself give a York climate entity. Worth watching, not worth waiting for. |
| **D. Manufacturer Wi-Fi module** (if one exists for this line)         | The module; York/Midea app | Maybe, through a vendor integration                                                                                                                                                                                             | Would give **real state feedback** (it talks to the unit, not at it). **Existence and compatibility for the YHHE18C3I1 were not found.** Verify in check 2. Often cloud-tied: weigh that against the local-first goal.                                                                                                                                                                   |

**IR protocol hint.** The open [IRremoteESP8266](https://crankyoldgit.github.io/IRremoteESP8266/doxygen/html/classIRYorkAc.html)
library has a York AC protocol (added in v2.8.5, [PR #1889](https://www.github.com/crankyoldgit/IRremoteESP8266/pull/1889)),
but it was reverse-engineered from an **older York unit (model MHH07P17, remote GRYLH2A)**. It may or may not
apply to the YHHE line. Learning the codes with a bridge and comparing them is the way to find out.

## 5. The state problem (read this before designing UI)

Infrared is **one-way**: the bridge transmits and the air conditioner never answers. Consequently:

- ESPHome's documentation says it plainly: with IR the component **cannot read the unit's actual state, so it
  assumes the last one it sent** (and can restore that assumption at boot). See [climate_ir](https://esphome.io/components/climate/climate_ir.html).
- Real SmartIR users report that switching the AC with its **own remote or the vendor app is not reflected in
  Home Assistant**, and that a Broadlink only receives IR while in learning mode ([forum thread](https://community.home-assistant.io/t/smartir-control-your-climate-tv-and-fan-devices-via-ir-rf-controllers/100798/1540)).
  The same source does not describe this with the term "assumed state"; that wording is mine.
- A bare **power toggle** code makes things worse: send it twice (or after someone used the remote) and the
  assumed state is inverted. Prefer codes that set an absolute state (check 4).

**Mitigations, from cheapest to most reliable** (none tested here):

1. **Send absolute-state frames** and re-send the full state on every change.
2. **Add a power-monitoring smart plug or clamp** on the AC's supply and give it to SmartIR as `power_sensor`
   (with `power_sensor_restore_state`) so on/off follows reality. **Caveat:** an inverter unit draws little
   in standby and varies with load, so the on/off threshold has to be measured on this unit, and
   wiring an AC (220 V, high current) through a plug is **not** safe unless rated for it. A clamp meter on the
   circuit, installed by an electrician, is the safe form.
3. **Add a room temperature sensor.** It does not prove the AC is on, but a falling temperature after "cool"
   is useful evidence.
4. **ESPHome with a receiver** next to the unit, so the original remote's presses are heard (only for the
   platforms that support it).
5. **A vendor Wi-Fi module** (option D), if it exists: real feedback.

## 6. How it would fit Home Control

- The API **already maps Home Assistant `climate` entities** (type `climate`, with `turn_on` / `turn_off`
  depending on the entity's features, `set_hvac_mode` and `set_temperature` with its limits). A SmartIR or
  ESPHome climate entity would appear with no new adapter, and the existing allowlist, validation, `accepted`
  vs `confirmed` result and audit rules would apply unchanged.
- **Gap to close first (new task, not done here):** the device model has **no way to say a state is
  assumed**. Showing "24 °C, cool, on" as a fact for an IR unit would break the honesty rule the whole UI is
  built on. Proposed work: carry a `stateSource` (`reported` or `assumed`) from the Home Assistant entity
  into the canonical `Device`, show "estado presumido" in the UI, and never report `confirmed` for a command
  whose effect cannot be observed. Whether SmartIR/ESPHome entities expose Home Assistant's `assumed_state`
  attribute was **not verified**.
- A command to an IR unit can only ever be `accepted`, never `confirmed`, unless a feedback source
  (power sensor, vendor module) is added.

## 7. Hardware and cost

The unit costs a few thousand reais ([retail listing](https://webarcondicionado.com.br/produto/ar-condicionado-split-18000-btu-quente-frio-inverter-york-220v-yhhe18c3i1));
the bridge is a small fraction of that. **Prices of the accessories were not researched** (they change
and depend on the store), so none are quoted here. Categories, all **optional**:

| Item                                      | Needed for             | Required?     |
| ----------------------------------------- | ---------------------- | ------------- |
| IR bridge (Broadlink RM4 mini or similar) | Options A / A+         | One of A/B    |
| ESP32 + IR LED (+ IR receiver), parts     | Option B               | One of A/B    |
| Power-monitoring plug or clamp meter      | Real on/off feedback   | Recommended   |
| Room temperature sensor                   | Context, not proof     | Optional      |
| Manufacturer Wi-Fi module                 | Option D, if it exists | Only if found |

**No purchase is part of the MVP** and none is recommended until the checks in section 3 are done.

## 8. Risks

- **Unknown protocol or non-absolute codes** may make reliable control impossible with IR alone (check 4).
- **Assumed state** can silently drift (section 5). Without a feedback source, expect it to be wrong
  sometimes; the UI must say so.
- **Custom components** (SmartIR) are community-maintained, not part of Home Assistant core. Another listed
  project, AR Smart IR, was reported as archived.
- **Warranty and safety.** Do not open the indoor unit or wire anything into the AC supply yourself. A plug
  between the AC and the wall may be unsafe or void the warranty depending on rating.
- **Cloud lock-in** if the only route is a vendor module (option D).

## 9. Suggested next steps (each needs your approval; none is started)

1. Do the label and remote checks (section 3) and add the findings to this file.
2. If a Wi-Fi module exists for the line, compare option D with IR.
3. Otherwise, buy **one** IR bridge and run a one-hour experiment: learn power/cool/temperature codes, test
   from Home Assistant, and note whether absolute states work.
4. Open a task for `stateSource: assumed` in the device model and UI (section 6) **before** exposing the AC.
5. Only then decide on SmartIR vs ESPHome and on a feedback source.

## 10. What was _not_ verified

- Everything specific to the YHHE18C3I1: remote model, IR protocol, Wi-Fi capability, spec sheet.
- That any listed integration produces a working climate entity for this unit.
- That HA's native Infrared receive side shipped in a stable release (only beta notes were found).
- Prices and local availability of every accessory.
- Whether `assumed_state` is exposed for IR climate entities in Home Assistant.

## Sources

- [Retail listing: York YHHE18C3I1](https://webarcondicionado.com.br/produto/ar-condicionado-split-18000-btu-quente-frio-inverter-york-220v-yhhe18c3i1)
- [Home Assistant: Broadlink integration](https://www.home-assistant.io/integrations/broadlink/)
- [SmartIR (GitHub)](https://github.com/smartHomeHub/SmartIR) and its [climate documentation](https://raw.githubusercontent.com/smartHomeHub/SmartIR/master/docs/CLIMATE.md)
- [SmartIR thread on the Home Assistant community forum](https://community.home-assistant.io/t/smartir-control-your-climate-tv-and-fan-devices-via-ir-rf-controllers/100798/1540)
- [ESPHome: IR climate](https://esphome.io/components/climate/climate_ir.html)
- [Home Assistant 2026.4 release notes (Infrared)](https://www.home-assistant.io/blog/2026/04/01/release-20264/)
- [IRremoteESP8266: IRYorkAc](https://crankyoldgit.github.io/IRremoteESP8266/doxygen/html/classIRYorkAc.html) and [PR #1889](https://www.github.com/crankyoldgit/IRremoteESP8266/pull/1889)
- [Midea heat pump ESPHome (mentions York among Midea-family brands, Modbus)](https://github.imc.re/rysiulg/Midea-heat-pump-ESPHome)
