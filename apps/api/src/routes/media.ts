import type { FastifyInstance } from 'fastify';
import { API_MEDIA_ACTIVITY_PATH, type MediaActivityResponse } from '@home-control/shared';

export function registerMediaRoutes(app: FastifyInstance): void {
  /** Read-only. Commands for a source go through the regular device actions. */
  app.get<{ Reply: MediaActivityResponse }>(API_MEDIA_ACTIVITY_PATH, async () =>
    app.mediaActivity.snapshot(),
  );
}
