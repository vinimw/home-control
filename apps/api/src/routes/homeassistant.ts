import type { FastifyInstance } from 'fastify';
import {
  API_HA_PING_PATH,
  API_HA_STATUS_PATH,
  type HomeAssistantStatusResponse,
} from '@home-control/shared';

export function registerHomeAssistantRoutes(app: FastifyInstance): void {
  /**
   * Integration snapshot. Always 200: a degraded integration is information, not a failure.
   * Device data is deliberately limited to counters; the devices API (with auth) comes later.
   */
  app.get<{ Reply: HomeAssistantStatusResponse }>(API_HA_STATUS_PATH, async () => ({
    ...(await app.homeAssistant.getStatus()),
    devices: app.devices.summary(),
  }));

  /** Live REST probe. Returns a structured error (see error handler) when Home Assistant fails. */
  app.get<{ Reply: { message: string } }>(API_HA_PING_PATH, async () => app.homeAssistant.ping());
}
