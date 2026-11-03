import Fastify, { type FastifyInstance } from 'fastify';
import { API_HEALTH_PATH, type HealthResponse } from '@home-control/shared';

export interface ServerOptions {
  logLevel?: string;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({ logger: { level: options.logLevel ?? 'info' } });

  app.get<{ Reply: HealthResponse }>(API_HEALTH_PATH, async () => ({
    status: 'ok',
    service: 'home-control-api',
    timestamp: new Date().toISOString(),
  }));

  return app;
}
