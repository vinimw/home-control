# Alexa diagnostics — first delivery (#58)

The user narrowed the first delivery to **our system**, not calls made inside Home Assistant. The
implementation requires no add-on, credentials change, HA-side collector or integration reactivation.

## Coverage and accounting

- `/echo/diagnostics`, also linked from settings, reads only authenticated local SQLite records.
- `operation` records describe responses to Alexa/custom-device/device/HA API routes, including failed
  operations. Correlation uses a UUID per incoming request, and REST attempts inherit it through async
  context. A replay/rejection with no dispatch has zero correlated REST attempts.
- `rest` records are written at dispatch and updated on completion with the same event id, not counted
  twice. They include request time, completion time, monotonic duration, status, safe parameters and
  response type/array size. A crash leaves a pending record, not fabricated success. Timeouts are attempts
  with unknown downstream outcome. There is no new automatic HTTP retry.
- `ws-out`, `ws-in` and `connection` record HA connection lifecycle, message types and numeric message
  ids. Message ids share a per-client UUID namespace to correlate replies without collisions on restart.
  Authentication messages record only their type, never credentials. Inbound states/voice data are omitted.
- Background discovery/registry reads are shared HA infrastructure, not Amazon consumption. WS messages
  and logical operations are separate counters. Amazon attempts remain **not observed**.
- Results are summaries, not full HA payloads: HTTP status, response shape/array size and numeric
  Retry-After where present. Free-form command text, headers, cookies, raw voice/state payloads and token
  values never persist. Request parameters follow a numeric/boolean/identifier allowlist.

## Storage and presentation

Migration 7 adds a bounded SQLite event store. Retention is seven days OR 10,000 records, whichever
expires first. Read and write paths prune records; the screen shows the retained range and process-local
logging failure count. Storage failures never trigger dispatch retries or escape the observer. Counts
may be incomplete when logging fails or retention expires. No pre-installation traffic is reconstructed.

Dates are UTC ISO strings in storage/exports; the screen renders seconds in America/Sao_Paulo and safe
request/response details retain millisecond timestamps. Time-range form inputs use the browser timezone,
explicitly labeled. Filters, counts and exports use the same retained selection. Exports are capped at
10,000 records; CSV cells neutralize spreadsheet formula prefixes.

The chart shows the latest 60 recorded minute buckets in the selected range and has a textual alternative.
It does not turn absent buckets into an assertion of zero traffic. Pagination uses 50 rows. Automatic
refresh reads local data at most every ten seconds while visible; users may pause it without pausing
server-side collection. Authentication applies to the page and fixed JSON relay; no capture-clearing or
provider-dispatch endpoint is exposed by this screen.

## Deliberate limits

Integration pause/polling state is not inferred from unavailable devices or queried by this panel.
Counters describe this process's observable activity, not other Home Assistant users, native HA polling
or Amazon billing/rate-limit accounting. Safe request summaries omit arbitrary command/source/app names
rather than risking private content. HTTP errors retain status/code, not potentially secret response bodies.
Future downstream tracing is separate work and is not a prerequisite for this delivery.
