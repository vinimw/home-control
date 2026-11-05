import type { ApiErrorPayload } from './errors.js';

export const API_HISTORY_PATH = '/history';

export type HistoryKind = 'device_command' | 'scene_run';

/**
 * - `confirmed` / `accepted` / `failed`: the outcome of a command that was executed (or of a scene).
 * - `partial`: a scene where some steps worked and some failed.
 * - `rejected`: refused before anything was sent (unsupported command, invalid params, unavailable...).
 */
export type HistoryOutcome = 'confirmed' | 'accepted' | 'failed' | 'partial' | 'rejected';

export interface HistoryEntry {
  id: number;
  at: string;
  kind: HistoryKind;
  /** `api` for a direct request, `scene` for a step run by a scene. */
  source: 'api' | 'scene';
  deviceId: string | null;
  command: string | null;
  /** Only safe parameter values (numbers, booleans, short allowlisted strings). */
  params: Record<string, unknown>;
  sceneId: string | null;
  sceneName: string | null;
  /** Groups a scene run with the commands its steps executed. */
  runId: string | null;
  outcome: HistoryOutcome;
  error: ApiErrorPayload | null;
  durationMs: number | null;
}

export interface HistoryQuery {
  kind?: HistoryKind;
  outcome?: HistoryOutcome;
  source?: 'api' | 'scene';
  deviceId?: string;
  sceneId?: string;
  runId?: string;
  from?: string;
  to?: string;
  limit?: number;
  /** Returns entries older than this id (`nextCursor` of the previous page). */
  before?: number;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  /** Pass as `before` to get the next (older) page; `null` at the end. */
  nextCursor: number | null;
}
