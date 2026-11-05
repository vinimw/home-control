import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { parseOrThrow } from './validation.js';
const query = z
  .object({
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
    kind: z.enum(['operation', 'rest', 'ws-in', 'ws-out', 'connection']).optional(),
    source: z.string().max(150).optional(),
    outcome: z.string().max(60).optional(),
    q: z.string().max(100).optional(),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
    limit: z.coerce.number().int().min(1).max(10000).default(50),
  })
  .strict();
export function registerDiagnosticsRoutes(app: FastifyInstance) {
  app.get('/diagnostics/alexa', async (request) =>
    app.storage.diagnostics.read(parseOrThrow(query, request.query, 'query')),
  );
}
