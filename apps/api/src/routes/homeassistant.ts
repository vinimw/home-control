import type { FastifyInstance } from 'fastify';
import {
  API_HA_PING_PATH,
  API_HA_STATUS_PATH,
  type HomeAssistantStatus,
} from '@home-control/shared';

export function registerHomeAssistantRoutes(app: FastifyInstance): void {
  /** Integration snapshot. Always 200: a degraded integration is information, not a failure. */
  app.get<{ Reply: HomeAssistantStatus }>(API_HA_STATUS_PATH, async () =>
    app.homeAssistant.getStatus(),
  );

  /** Live REST probe. Returns a structured error (see error handler) when Home Assistant fails. */
  app.get<{ Reply: { message: string } }>(API_HA_PING_PATH, async () => app.homeAssistant.ping());
}
