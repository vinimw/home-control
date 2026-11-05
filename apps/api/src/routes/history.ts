import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { API_HISTORY_PATH, type HistoryPage } from '@home-control/shared';
import { parseOrThrow } from './validation.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
const query = z
  .object({
    kind: z.enum(['device_command', 'scene_run']).optional(),
    outcome: z.enum(['confirmed', 'accepted', 'failed', 'partial', 'rejected']).optional(),
    source: z.enum(['api', 'scene']).optional(),
    deviceId: id.optional(),
    sceneId: id.optional(),
    runId: id.optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    before: z.coerce.number().int().min(1).optional(),
  })
  .strict();

export function registerHistoryRoutes(app: FastifyInstance): void {
  /**
   * Persistent audit trail of device commands and scene runs, newest first. Read-only; it stores no
   * credentials, tokens or free text (see `sanitizeParams`).
   */
  app.get<{ Reply: HistoryPage }>(API_HISTORY_PATH, async (request) =>
    app.storage.history.list(parseOrThrow(query, request.query, 'query')),
  );
}
