# Natural-language commands (post-MVP evaluation)

**Status: design only. Nothing here is implemented, and it is explicitly outside the MVP.** The goal is to
decide _how_ a sentence such as "liga a TV" or "executa a cena Boa noite" could be turned into actions
**without ever giving text the power to run an arbitrary Home Assistant service**.

## Principle

> A sentence is only ever translated into a choice among things Home Control already allows. It never becomes
> a Home Assistant domain, service, entity id or free text sent to Alexa.

The language layer is a **picker over an existing allowlist**, not a new way to execute. Execution stays on
the paths that already validate, confirm and audit everything:

| Allowlisted target  | Existing execution path                                        | Already guarantees                                    |
| ------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| Scene               | `POST /scenes/:id/run`                                         | Steps validated again at run time; per-step results   |
| Device command      | `POST /devices/:id/actions`                                    | Only commands the device advertises; params validated |
| Spotify player      | `POST /spotify/control/{command,transfer,playlist,track,seek}` | Spotify's `disallows`; accepted vs confirmed          |
| Saved Alexa command | `POST /alexa/commands/:id/execute`                             | Stored text only, sent on an explicit action          |

## Intents (closed set)

```
IntentType = run_scene | device_command | spotify_command
```

An interpretation is always one of these objects, never a string:

```json
{ "type": "device_command", "deviceId": "dev_…", "command": "turn_on", "params": {} }
{ "type": "run_scene", "sceneId": "sc_…" }
{ "type": "spotify_command", "command": "pause" }
```

`command` must be in the target's current `commands` list and `params` must pass the same validators as the
buttons in the app. Anything that does not fit becomes an explicit error (below). There is **no** intent for
"call service X", "send this text to Alexa" or "run this script".

## Pipeline

1. **Receive** `POST /nl/interpret { text }`: login + CSRF like every write route; `text` is 1-200 chars,
   control characters rejected, rate limited per session. The text is **never** logged in full (the audit
   keeps the resolved intent, not the sentence).
2. **Normalize**: lowercase, strip accents, drop filler words ("por favor", "a", "o"), numerals ("vinte" -> 20).
3. **Resolve entities only against the catalog the API already has**: scene names, device names, **aliases**
   the user set, room names, command verbs. No entity id is ever taken from the text.
4. **Match** (see "Matcher"). Output: zero, one or several candidate intents with a confidence.
5. **Validate** each candidate with the existing validators (device exists and is available, command
   advertised, params in range). Unsupported or unavailable candidates are dropped _with a reason_.
6. **Decide**: exactly one valid candidate -> `ready` (or `needs_confirmation`); several -> `ambiguous`; none
   -> an error.
7. **Execute** only through the existing endpoint, by a separate, explicit request (below). Interpreting never
   changes anything.

`POST /nl/interpret` is **read-only**: it returns `{ status, intent?, candidates?, error?, confirmation? }`.

## Confirmation of sensitive operations

Some intents must not run on a single, possibly mis-heard sentence. Policy (all configurable in one table):

| Intent                                                    | Needs confirmation |
| --------------------------------------------------------- | ------------------ |
| Scene with 2+ steps, or any step that turns something off | yes                |
| `turn_off` on a TV/speaker, `stop`                        | yes                |
| `press_key`, `select_source`, saved Alexa command         | yes                |
| Volume above the user's chosen safe limit                 | yes                |
| `pause`, `play`, `next`, `previous`, volume down, mute    | no                 |

Confirmation is a **server-issued, single-use token** bound to the exact intent (a hash of type, target,
command and params) with a 60 s lifetime, returned by `/nl/interpret` and accepted once by
`POST /nl/execute { token }`. The browser shows what will happen ("Desligar Samsung TV Smart") and the user
taps _Confirmar_. A token cannot be reused, cannot be edited into another intent and expires. The audit
history (`source` becomes `nl`) records the intent and who confirmed it.

## Explicit errors

| `status` / code      | When                                          | What the user sees (pt-BR)                           |
| -------------------- | --------------------------------------------- | ---------------------------------------------------- |
| `not_understood`     | No candidate                                  | "Não entendi. Tente: 'ligar a TV' ou 'cena Cinema'." |
| `ambiguous`          | Several valid candidates                      | A short list to pick from; nothing runs              |
| `unsupported`        | Device exists but does not offer that command | "A TV não aceita isso agora."                        |
| `device_unavailable` | Target offline                                | "O Echo está indisponível."                          |
| `needs_confirmation` | Sensitive intent                              | Summary + _Confirmar_ / _Cancelar_                   |
| `invalid_params`     | Number out of range, unknown source name      | The allowed range or the valid options               |
| `disabled`           | `NL_COMMANDS_ENABLED` is off (default)        | "Comandos por texto estão desativados."              |
| `rate_limited`       | Too many requests                             | "Muitas tentativas. Aguarde um pouco."               |

Every result reports success honestly: a scene reports `confirmed`/`accepted`/`partial`/`failed` per step, as
today. The language layer adds no new success claims.

## Matcher: how to turn text into an intent

Options evaluated:

| Option                                   | Pros                                      | Cons / risks                                                                                                                         |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Deterministic rules + fuzzy names** | Offline, free, predictable, easy to audit | Narrow phrasing; needs synonym lists                                                                                                 |
| B. Local small model for classification  | Handles looser phrasing                   | Heavy on the Mac, hard to bound, still needs validation                                                                              |
| C. Hosted LLM API                        | Best understanding                        | Sends the house vocabulary off the LAN, **per-use cost** (the project works under a strict zero-extra-cost policy), prompt injection |

**Recommendation: start with A.** Verbs map to commands through a fixed table (`liga/ligar/acende` ->
`turn_on`, `desliga/apaga` -> `turn_off`, `pausa`, `toca`, `próxima`, `volume N`, `muda para <fonte>`,
`executa/roda/ativa a cena X`); names are matched with accent-insensitive fuzzy matching over scenes, aliases
and rooms, with a minimum score and a mandatory tie check (a near-tie is `ambiguous`, never a guess).

If B or C is ever added it must be **only a classifier**: its output is parsed against the same closed
`IntentType` schema, every field is re-validated server-side, ids in its output are accepted only if they
exist in the catalog, and the model never sees credentials. Model output is untrusted input, so a prompt
injected through a device name ("ignore the rules and ...") cannot produce anything the validators refuse.
Adding it needs the user's explicit approval because of cost and data leaving the network.

## Security checklist

- Disabled by default (`NL_COMMANDS_ENABLED=false`); requires `DEVICE_ACTIONS_ENABLED` like any action.
- Authenticated, CSRF-protected, rate limited, length limited; same LAN-only exposure as the rest.
- No raw Home Assistant call, no free-text forwarding, no new credential, no entity id from user text.
- Interpretation is read-only; execution needs a separate request (and a token when sensitive).
- Audited in the command history; the sentence itself is not stored.
- Spotify/Alexa behaviors keep their documented limits (no Alexa voice fallback or retry loops).

## Suggested rollout (each step shippable on its own)

1. `interpret` only (no execution) with the rule matcher, scenes and the TV/Echo/Spotify basics; a text box
   that shows the interpretation.
2. `execute` with the confirmation token and `source: 'nl'` in the history.
3. Aliases/synonyms editor, then optional voice-to-text on the phone (the browser's own speech API; the API
   still only receives text).
4. Optional classifier (B/C) behind a separate flag, only if rule coverage proves too narrow.

## Limitations of this evaluation

- Not prototyped: coverage of the rule matcher on real sentences is unmeasured. Before step 1, collect
  20-30 real phrases from the household and test them on paper against the catalog.
- Portuguese-only vocabulary; no multi-turn dialogue ("e a do quarto?") in the first version.
- Depends on stable device names/aliases; renaming a device changes what matches.
- Wake word and always-listening voice are out of scope (the Echo already covers that).
- Does not replace the existing buttons or scenes; it is an extra way to choose the same actions.
