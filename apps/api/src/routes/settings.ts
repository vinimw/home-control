import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { API_SETTINGS_PATH, type AppSettings } from '@home-control/shared';
import { ApiError } from '../errors.js';
import { parseOrThrow } from './validation.js';

const updateBody = z
  .object({
    homeName: z
      .string()
      .trim()
      .min(1, { message: 'must not be empty' })
      .max(60, { message: 'must be at most 60 characters' })
      .regex(/^[^\p{Cc}]*$/u, { message: 'must not contain control characters' })
      .optional(),
  })
  .strict();

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get<{ Reply: AppSettings }>(API_SETTINGS_PATH, async () => app.storage.settings.get());

  app.patch<{ Reply: AppSettings }>(API_SETTINGS_PATH, async (request) => {
    const change = parseOrThrow(updateBody, request.body, 'body');
    if (Object.keys(change).length === 0) {
      throw new ApiError('bad_request', 'Invalid body: provide at least one field');
    }
    return app.storage.settings.update(change);
  });
}
