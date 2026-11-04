#!/usr/bin/env node
/**
 * Probes a real device through the Home Control API and prints a Markdown report:
 *   1. the capability matrix the API actually exposes (and the commands it does NOT offer);
 *   2. optionally (--execute), the result of a guided control sequence.
 *
 * Read-only unless --execute is given. Nothing here is mocked: results come from the running API and,
 * through it, from your real Home Assistant. Requires `pnpm build` (it reads the shared command list).
 *
 * IMPORTANT: "confirmed" means Home Assistant REPORTED the expected state. For some devices (for example
 * TVs) that state can be assumed or polled, so the physical effect must still be observed by a human:
 * the report leaves a column for that. Never record it as verified without looking at the device.
 */
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DEVICE_COMMAND_NAMES } from '../packages/shared/dist/index.js';

const USAGE = `Usage: pnpm device:probe [options]

  --api <url>      API base URL (default http://localhost:3001)
  --type <type>    Device type to look for (default tv)
  --name <text>    Only devices whose name contains this text (case-insensitive)
  --device <id>    Probe exactly this device id
  --execute        Run the guided control sequence (needs DEVICE_ACTIONS_ENABLED=true on the API)
  --disruptive     With --execute: also test power and source (may turn the device off / change input)
  --out <file>     Also write the report to this file
  --help           Show this help

Without --execute nothing is sent to the device.

The API requires a login. Put the password in the HOME_CONTROL_PASSWORD environment variable (not on the
command line, where it would stay in your shell history):

  HOME_CONTROL_PASSWORD='...' pnpm device:probe --type tv`;

const { values: opts } = parseArgs({
  options: {
    api: { type: 'string', default: 'http://localhost:3001' },
    type: { type: 'string', default: 'tv' },
    name: { type: 'string' },
    device: { type: 'string' },
    execute: { type: 'boolean', default: false },
    disruptive: { type: 'boolean', default: false },
    out: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (opts.help) {
  console.log(USAGE);
  process.exit(0);
}

const api = opts.api.replace(/\/+$/, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Removes identifiers that must never be committed: MAC addresses, IPv4 addresses, serial numbers. */
function redact(text) {
  return text
    .replace(/\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g, '[redacted-mac]')
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[redacted-ip]')
    .replace(
      /(serial(?:\s*(?:number|no\.?))?\s*[:=]?\s*)[A-Za-z0-9-]{6,}/gi,
      '$1[redacted-serial]',
    );
}

/** Session obtained by logging in with HOME_CONTROL_PASSWORD (null when none was given). */
let session = null;

async function login() {
  const password = process.env.HOME_CONTROL_PASSWORD;
  if (!password) return;
  let response;
  try {
    response = await fetch(`${api}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    fail(
      `Could not reach the API at ${api} (${error.cause?.code ?? error.message}). Is it running?`,
    );
  }
  if (!response.ok) {
    fail(
      response.status === 429
        ? 'Too many login attempts: wait a moment and try again.'
        : 'Login failed: check HOME_CONTROL_PASSWORD.',
    );
  }
  const body = await response.json();
  const cookie = (response.headers.getSetCookie?.() ?? [])[0]?.split(';')[0];
  if (!cookie || !body.csrfToken) fail('Login did not return a session.');
  session = { cookie, csrf: body.csrfToken };
}

async function request(path, init = {}) {
  const started = Date.now();
  let response;
  const headers = { ...init.headers };
  if (session) {
    headers.cookie = session.cookie;
    if (init.method && init.method !== 'GET') headers['x-csrf-token'] = session.csrf;
  }
  try {
    response = await fetch(`${api}${path}`, {
      ...init,
      headers,
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(
      `Could not reach the API at ${api} (${error.cause?.code ?? error.message}). Is it running?`,
      { cause: error },
    );
  }
  const body = await response.json().catch(() => null);
  return { http: response.status, body, ms: Date.now() - started };
}

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------------
// 1. Find the device
// ---------------------------------------------------------------------------------------------------
await login();
const list = await request(`/devices?type=${encodeURIComponent(opts.type)}`).catch((e) =>
  fail(e.message),
);
if (list.http === 401) {
  fail('The API requires a login. Set HOME_CONTROL_PASSWORD (see --help) and run again.');
}
if (list.http !== 200)
  fail(`GET /devices returned HTTP ${list.http}: ${JSON.stringify(list.body?.error ?? list.body)}`);

let candidates = list.body.devices;
if (opts.device) candidates = candidates.filter((d) => d.id === opts.device);
if (opts.name)
  candidates = candidates.filter((d) => d.name.toLowerCase().includes(opts.name.toLowerCase()));

if (!list.body.summary.ready) {
  fail(
    'The device registry is not ready yet (Home Assistant not configured or not reachable). Check GET /ha/status.',
  );
}
if (candidates.length === 0) {
  fail(
    `No device of type "${opts.type}" found${opts.name ? ` matching "${opts.name}"` : ''}. ` +
      'Pair it in Home Assistant first (see docs/SAMSUNG_TV.md), then try again.',
  );
}
if (candidates.length > 1) {
  console.error(
    `Several "${opts.type}" devices found. Choose one with --device <id> or --name <text>:`,
  );
  for (const d of candidates) console.error(`  ${d.id}  ${d.name}  [${d.availability}]`);
  process.exit(1);
}

let device = candidates[0];

// ---------------------------------------------------------------------------------------------------
// 2. Capability matrix
// ---------------------------------------------------------------------------------------------------
const lines = [];
const out = (line = '') => lines.push(line);

const offered = new Set(device.commands.map((c) => c.name));
const excluded = DEVICE_COMMAND_NAMES.filter((name) => !offered.has(name));
const paramText = (params) =>
  params.length === 0
    ? '—'
    : params
        .map((p) => {
          const range =
            p.min !== undefined || p.max !== undefined ? ` ${p.min ?? ''}..${p.max ?? ''}` : '';
          const options = p.options?.length ? ` one of: ${p.options.join(', ')}` : '';
          return `${p.name}: ${p.type}${range}${options}`;
        })
        .join('; ');

out(`# Device probe: ${device.name}`);
out();
out(`- Generated: ${new Date().toISOString()}`);
out(`- Type: ${device.type}`);
out(`- Availability: **${device.availability}**`);
out(`- Room: ${device.room?.name ?? '—'}`);
out(`- Manufacturer / model: ${device.manufacturer ?? '—'} / ${device.model ?? '—'}`);
out(`- Registry enrichment: ${list.body.summary.enrichment ?? 'unknown'}`);
out(`- Capabilities: ${device.capabilities.length ? device.capabilities.join(', ') : 'none'}`);
out();
out('## Commands the API offers for this device');
out();
if (device.commands.length === 0) {
  out(
    '_None._ A device with no commands is read-only (or has not reported its features; see availability).',
  );
} else {
  out('| Command | Parameters |');
  out('| --- | --- |');
  for (const c of device.commands) out(`| \`${c.name}\` | ${paramText(c.params)} |`);
}
out();
out('## Commands NOT offered (explicitly excluded)');
out();
out(
  'These are rejected with `422 unsupported_action` and must not be shown as available in any UI. ' +
    'Navigation keys (d-pad, home, back) are not part of the canonical model yet.',
);
out();
out(excluded.map((name) => `\`${name}\``).join(', ') || '_None._');
out();
out('## Reported state');
out();
out('```json');
out(JSON.stringify(device.state, null, 2));
out('```');

// ---------------------------------------------------------------------------------------------------
// 3. Guided control sequence (opt-in)
// ---------------------------------------------------------------------------------------------------
const rows = [];

async function refresh() {
  const res = await request(`/devices/${device.id}`);
  if (res.http === 200) device = res.body;
  return device;
}

async function act(label, command, params, { settle = 1200 } = {}) {
  const before = structuredClone(device.state);
  const res = await request(`/devices/${device.id}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command, ...(params ? { params } : {}), requestId: randomUUID() }),
  });
  await sleep(settle);
  await refresh();
  const result = res.body?.status ?? 'rejected';
  const error = res.body?.error?.code ?? '';
  const changed = Object.keys(device.state)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(device.state[key]))
    .map((key) => `${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(device.state[key])}`);
  rows.push({
    label,
    command,
    params: params ? JSON.stringify(params) : '—',
    status: result,
    http: res.http,
    error,
    ms: res.ms,
    changed: changed.join('; ') || 'no change reported',
  });
  return res;
}

if (opts.execute) {
  const first = await request(`/devices/${device.id}/actions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command: '__probe__' }),
  });
  if (first.http === 403 && first.body?.error?.code === 'actions_disabled') {
    fail(
      'Device actions are disabled on the API. Set DEVICE_ACTIONS_ENABLED=true in .env, ' +
        'restart the API and run again.',
    );
  }

  if (device.availability === 'unavailable')
    fail('The device is unavailable: turn it on / reconnect it first.');
  const has = (name) => offered.has(name);
  const original = structuredClone(device.state);

  console.error(
    `Running control sequence on "${device.name}". Watch the device and note what actually happens.`,
  );

  if (has('set_mute') && original.muted !== null) {
    await act('Mute toggle', 'set_mute', { muted: !original.muted });
    await act('Mute restore', 'set_mute', { muted: original.muted });
  }
  if (has('set_volume') && original.volume !== null) {
    const target = original.volume >= 99 ? original.volume - 1 : original.volume + 1;
    await act('Volume +1', 'set_volume', { level: target });
    await act('Volume restore', 'set_volume', { level: original.volume });
  }
  if (has('volume_up') && has('volume_down')) {
    await act('Volume step up', 'volume_up');
    await act('Volume step down', 'volume_down');
  }

  if (opts.disruptive) {
    // Navigation changes what is on the TV screen: it only runs in the disruptive pass.
    if (has('press_key')) {
      for (const key of ['right', 'left', 'down', 'up', 'home', 'back']) {
        await act(`Key ${key}`, 'press_key', { key });
        await sleep(600);
      }
      await act('Key ok (selects whatever is focused)', 'press_key', { key: 'ok' });
    }
    if (has('launch_app')) {
      const spec = device.commands.find((c) => c.name === 'launch_app');
      for (const app of spec?.params?.[0]?.options ?? []) {
        await act(`Launch ${app}`, 'launch_app', { app }, { settle: 4000 });
      }
    }
    if (has('select_source') && original.source) {
      // Re-selecting the current source should not change what is on screen.
      await act('Select current source', 'select_source', { source: original.source });
    }
    if (has('turn_off')) {
      await act('Power off', 'turn_off', undefined, { settle: 4000 });
      if (has('turn_on')) {
        await sleep(8000);
        await act('Power on', 'turn_on', undefined, { settle: 8000 });
      } else {
        rows.push({
          label: 'Power on',
          command: 'turn_on',
          params: '—',
          status: 'NOT OFFERED',
          http: '—',
          error: '',
          ms: '—',
          changed:
            'The API does not offer turn_on for this device (see "Commands NOT offered"). Turn it on manually.',
        });
      }
    }
  }

  out();
  out('## Control sequence results');
  out();
  out(
    '`accepted`: Home Assistant took the command, effect not observed. `confirmed`: Home Assistant reported ' +
      'the expected state. **Neither proves the physical device reacted**: fill in the last column by looking at it.',
  );
  out();
  if (rows.length === 0) {
    out('_Nothing was run: the device offers none of the commands in the guided sequence._');
  } else {
    out(
      '| Step | Command | Params | API status | HTTP | Error | ms | State change reported | Observed on device (manual) |',
    );
    out('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of rows) {
      out(
        `| ${r.label} | \`${r.command}\` | ${r.params} | **${r.status}** | ${r.http} | ${r.error || '—'} | ${r.ms} | ${r.changed} | ⬜ |`,
      );
    }
  }
} else {
  out();
  out('_Read-only run: no command was sent. Use `--execute` for the guided control sequence._');
}

const report = redact(lines.join('\n')) + '\n';
console.log(report);
if (opts.out) {
  writeFileSync(opts.out, report);
  console.error(
    `Report written to ${opts.out}. Review it before committing: it must contain no serial number, MAC or IP.`,
  );
}
