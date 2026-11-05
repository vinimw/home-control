import { randomBytes } from 'node:crypto';
import type { Scene, SceneInput, SceneRun, SceneStep } from '@home-control/shared';
import type { Database } from './database.js';

export interface SceneRepository {
  /** Oldest first, so the list does not reshuffle when a scene is edited. */
  list(): Scene[];
  get(id: string): Scene | undefined;
  create(input: SceneInput): Scene;
  update(id: string, change: Partial<SceneInput>): Scene | undefined;
  recordRun(id: string, run: SceneRun): void;
  delete(id: string): boolean;
  count(): number;
}

interface Row {
  id: string;
  name: string;
  steps: string;
  last_run: string | null;
  created_at: string;
  updated_at: string;
}

const COLUMNS = 'id, name, steps, last_run, created_at, updated_at';

function toScene(row: Row): Scene {
  return {
    id: row.id,
    name: row.name,
    steps: JSON.parse(row.steps) as SceneStep[],
    lastRun: row.last_run ? (JSON.parse(row.last_run) as SceneRun) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteSceneRepository implements SceneRepository {
  constructor(private readonly db: Database) {}

  list(): Scene[] {
    const rows = this.db
      .prepare(`SELECT ${COLUMNS} FROM scenes ORDER BY created_at, id`)
      .all() as unknown as Row[];
    return rows.map(toScene);
  }

  get(id: string): Scene | undefined {
    const row = this.db.prepare(`SELECT ${COLUMNS} FROM scenes WHERE id = ?`).get(id) as
      Row | undefined;
    return row && toScene(row);
  }

  create(input: SceneInput): Scene {
    const id = `sc_${randomBytes(6).toString('hex')}`;
    const at = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO scenes (id, name, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, input.name, JSON.stringify(input.steps), at, at);
    return this.get(id)!;
  }

  update(id: string, change: Partial<SceneInput>): Scene | undefined {
    if (!this.get(id)) return undefined;
    const sets: string[] = [];
    const values: string[] = [];
    if (change.name !== undefined) {
      sets.push('name = ?');
      values.push(change.name);
    }
    if (change.steps !== undefined) {
      sets.push('steps = ?');
      values.push(JSON.stringify(change.steps));
    }
    if (sets.length > 0) {
      this.db
        .prepare(`UPDATE scenes SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`)
        .run(...values, new Date().toISOString(), id);
    }
    return this.get(id);
  }

  recordRun(id: string, run: SceneRun): void {
    this.db.prepare('UPDATE scenes SET last_run = ? WHERE id = ?').run(JSON.stringify(run), id);
  }

  delete(id: string): boolean {
    return this.db.prepare('DELETE FROM scenes WHERE id = ?').run(id).changes > 0;
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM scenes').get() as { n: number }).n;
  }
}
