import type {
  ApiErrorCode,
  HistoryEntry,
  HistoryKind,
  HistoryOutcome,
  HistoryPage,
  HistoryQuery,
} from '@home-control/shared';
import type { Database } from './database.js';

export type HistoryInput = Omit<HistoryEntry, 'id' | 'at'> & { at?: string };

export interface HistoryRepository {
  record(entry: HistoryInput): void;
  list(query: HistoryQuery): HistoryPage;
  /** Entries stored, for diagnostics of the history itself. */
  count(): number;
}

const MAX_ROWS = 5000;
const RETENTION_DAYS = 90;
/** Parameter names whose short string value is safe to keep; everything else is dropped. */
const SAFE_STRING_PARAMS = new Set(['source', 'key', 'app', 'mode']);

/** Keeps only values that can never be a credential: numbers, booleans and short allowlisted strings. */
export function sanitizeParams(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(params ?? {}).slice(0, 10)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
    else if (typeof value === 'boolean') out[name] = value;
    else if (typeof value === 'string' && SAFE_STRING_PARAMS.has(name) && value.length <= 64) {
      out[name] = value;
    } else out[name] = '[omitido]';
  }
  return out;
}

interface Row {
  id: number;
  at: string;
  kind: string;
  source: string;
  device_id: string | null;
  command: string | null;
  params: string;
  scene_id: string | null;
  scene_name: string | null;
  run_id: string | null;
  outcome: string;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
}

const toEntry = (r: Row): HistoryEntry => ({
  id: r.id,
  at: r.at,
  kind: r.kind as HistoryKind,
  source: r.source as HistoryEntry['source'],
  deviceId: r.device_id,
  command: r.command,
  params: JSON.parse(r.params) as Record<string, unknown>,
  sceneId: r.scene_id,
  sceneName: r.scene_name,
  runId: r.run_id,
  outcome: r.outcome as HistoryOutcome,
  error: r.error_code
    ? { code: r.error_code as ApiErrorCode, message: r.error_message ?? '' }
    : null,
  durationMs: r.duration_ms,
});

export class SqliteHistoryRepository implements HistoryRepository {
  private writes = 0;
  /** Writing history must never break the command it describes. */
  failures = 0;

  constructor(private readonly db: Database) {}

  record(entry: HistoryInput): void {
    try {
      this.db
        .prepare(
          `INSERT INTO command_history (at, kind, source, device_id, command, params, scene_id,
             scene_name, run_id, outcome, error_code, error_message, duration_ms)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          entry.at ?? new Date().toISOString(),
          entry.kind,
          entry.source,
          entry.deviceId,
          entry.command,
          JSON.stringify(sanitizeParams(entry.params)),
          entry.sceneId,
          entry.sceneName,
          entry.runId,
          entry.outcome,
          entry.error?.code ?? null,
          entry.error ? entry.error.message.slice(0, 300) : null,
          entry.durationMs,
        );
      if (++this.writes % 50 === 0) this.prune();
    } catch {
      this.failures++;
    }
  }

  private prune(): void {
    this.db
      .prepare('DELETE FROM command_history WHERE at < ?')
      .run(new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString());
    this.db
      .prepare('DELETE FROM command_history WHERE id <= (SELECT MAX(id) FROM command_history) - ?')
      .run(MAX_ROWS);
  }

  list(query: HistoryQuery): HistoryPage {
    const where: string[] = [];
    const values: Array<string | number> = [];
    const eq = (column: string, value: string | undefined) => {
      if (value !== undefined) {
        where.push(`${column} = ?`);
        values.push(value);
      }
    };
    eq('kind', query.kind);
    eq('outcome', query.outcome);
    eq('source', query.source);
    eq('device_id', query.deviceId);
    eq('scene_id', query.sceneId);
    eq('run_id', query.runId);
    if (query.from) {
      where.push('at >= ?');
      values.push(query.from);
    }
    if (query.to) {
      where.push('at <= ?');
      values.push(query.to);
    }
    if (query.before !== undefined) {
      where.push('id < ?');
      values.push(query.before);
    }
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = this.db
      .prepare(
        `SELECT * FROM command_history ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY id DESC LIMIT ?`,
      )
      .all(...values, limit + 1) as unknown as Row[];
    const page = rows.slice(0, limit).map(toEntry);
    return { entries: page, nextCursor: rows.length > limit ? page[page.length - 1]!.id : null };
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM command_history').get() as { n: number }).n;
  }
}
