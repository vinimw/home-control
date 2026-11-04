import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { API_DEVICE_LAYOUT_PATH, type DeviceLayout } from '@home-control/shared';
import { ApiError } from '../errors.js';
import { parseOrThrow } from './validation.js';

// Fits the web relay's 16 KB body limit, with room for JSON and the revision.
const body = z
  .object({
    revision: z
      .number()
      .int()
      .min(0)
      .max(Number.MAX_SAFE_INTEGER - 1),
    cardIds: z.array(z.string().regex(/^(?:dev_[0-9a-f]{16}|cd_[0-9a-f]{12})$/)).max(500),
  })
  .strict()
  .refine((value) => new Set(value.cardIds).size === value.cardIds.length, {
    message: 'cardIds must be unique',
  });

export function registerDeviceLayoutRoutes(app: FastifyInstance): void {
  app.get<{ Reply: DeviceLayout }>(API_DEVICE_LAYOUT_PATH, async (_request, reply) => {
    reply.header('cache-control', 'no-store');
    return app.storage.layout.get();
  });

  app.patch<{ Reply: DeviceLayout }>(API_DEVICE_LAYOUT_PATH, async (request, reply) => {
    const change = parseOrThrow(body, request.body, 'body');
    const saved = app.storage.layout.save(change);
    if (!saved) throw new ApiError('conflict', 'Layout changed. Reload before reordering again.');
    reply.header('cache-control', 'no-store');
    return saved;
  });
}
