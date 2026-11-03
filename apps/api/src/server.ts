import Fastify, { type FastifyInstance } from 'fastify';
import { API_HEALTH_PATH, type HealthResponse } from '@home-control/shared';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: true });

  app.get<{ Reply: HealthResponse }>(API_HEALTH_PATH, async () => ({
    status: 'ok',
    service: 'home-control-api',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
