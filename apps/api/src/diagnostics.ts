import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { DiagnosticEvent, DiagnosticsPage } from '@home-control/shared';
import type { Database } from './storage/database.js';

export const diagnosticContext = new AsyncLocalStorage<{ operationId: string; source: string }>();
export type Observation = Partial<DiagnosticEvent> &
  Pick<DiagnosticEvent, 'kind' | 'action' | 'outcome'>;
export type Observe = (event: Observation) => void;

/** Whitelist only structured transport metadata. Never serialize raw headers, text or HA state. */
export function safeRequest(body: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!body || typeof body !== 'object') return out;
  for (const [key, value] of Object.entries(body)) {
    if (
      ['volume_level', 'brightness', 'brightness_pct', 'is_volume_muted', 'temperature'].includes(
        key,
      ) &&
      (typeof value === 'boolean' || typeof value === 'number')
    )
      out[key] = value;
    if (['entity_id', 'device_id'].includes(key)) {
      const ids = Array.isArray(value) ? value : [value];
      out[key] = ids
        .slice(0, 10)
        .filter((v) => typeof v === 'string' && /^[a-zA-Z0-9_.-]{1,100}$/.test(v));
    }
    if (key === 'text_command') out.text_command = '[texto omitido]';
  }
  return out;
}
export function responseShape(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return { type: 'array', items: value.length };
  return { type: value === null ? 'null' : typeof value };
}
export class Diagnostics {
  readonly startedAt = new Date().toISOString();
  failures = 0;
  constructor(private readonly db: Database) {}
  readonly observe: Observe = (event) => {
    try {
      const context = diagnosticContext.getStore();
      const record: DiagnosticEvent = {
        id: randomUUID(),
        operationId: context?.operationId ?? randomUUID(),
        at: new Date().toISOString(),
        completedAt: null,
        source: context?.source ?? 'background',
        target: null,
        status: null,
        durationMs: null,
        request: {},
        response: {},
        ...event,
      };
      this.db
        .prepare('INSERT OR REPLACE INTO diagnostics VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(
          record.id,
          record.at,
          record.kind,
          record.source,
          record.action,
          record.outcome,
          JSON.stringify(record),
        );
      this.prune();
    } catch {
      this.failures++;
    } // Observability must never change command behavior or cause a retry.
  };
  attemptsFor(operationId: string): number {
    try {
      return (
        this.db
          .prepare(
            "SELECT COUNT(*) AS n FROM diagnostics WHERE kind = 'rest' AND json_extract(payload, '$.operationId') = ?",
          )
          .get(operationId) as { n: number }
      ).n;
    } catch {
      this.failures++;
      return 0;
    }
  }
  private prune() {
    this.db
      .prepare('DELETE FROM diagnostics WHERE at < ?')
      .run(new Date(Date.now() - 7 * 86400000).toISOString());
    this.db.exec(
      'DELETE FROM diagnostics WHERE id IN (SELECT id FROM diagnostics ORDER BY at DESC, rowid DESC LIMIT -1 OFFSET 10000)',
    );
  }
  read(filter: {
    from?: string;
    to?: string;
    kind?: string;
    source?: string;
    outcome?: string;
    q?: string;
    offset: number;
    limit: number;
  }): DiagnosticsPage {
    this.prune();
    const where: string[] = [];
    const values: string[] = [];
    for (const key of ['kind', 'source', 'outcome'] as const)
      if (filter[key]) {
        where.push(key + ' = ?');
        values.push(filter[key]);
      }
    if (filter.from) {
      where.push('at >= ?');
      values.push(filter.from);
    }
    if (filter.to) {
      where.push('at <= ?');
      values.push(filter.to);
    }
    if (filter.q) {
      where.push('(action LIKE ? OR payload LIKE ?)');
      values.push('%' + filter.q + '%', '%' + filter.q + '%');
    }
    const sql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const all = this.db
      .prepare('SELECT payload FROM diagnostics' + sql + ' ORDER BY at DESC, rowid DESC')
      .all(...values) as Array<{ payload: string }>;
    const events = all.map((row) => JSON.parse(row.payload) as DiagnosticEvent);
    const counts: Record<string, number> = {};
    const buckets = new Map<string, { at: string; requests: number; errors: number }>();
    for (const event of events) {
      counts[event.kind] = (counts[event.kind] ?? 0) + 1;
      if (event.kind === 'rest') {
        if (event.completedAt && event.outcome !== 'ok')
          counts.httpErrors = (counts.httpErrors ?? 0) + 1;
        if (event.status === 429) counts.http429 = (counts.http429 ?? 0) + 1;
        if (event.outcome === 'pending') counts.pending = (counts.pending ?? 0) + 1;
        const at = event.at.slice(0, 16) + ':00.000Z';
        const bucket = buckets.get(at) ?? { at, requests: 0, errors: 0 };
        bucket.requests++;
        if (event.completedAt && event.outcome !== 'ok') bucket.errors++;
        buckets.set(at, bucket);
      }
    }
    const oldest = this.db.prepare('SELECT MIN(at) AS at FROM diagnostics').get() as {
      at: string | null;
    };
    return {
      events: events.slice(filter.offset, filter.offset + filter.limit),
      total: events.length,
      counts,
      buckets: [...buckets.values()].sort((a, b) => a.at.localeCompare(b.at)),
      collector: {
        startedAt: this.startedAt,
        failures: this.failures,
        retentionDays: 7,
        maxEvents: 10000,
        oldestAt: oldest.at,
      },
    };
  }
}
