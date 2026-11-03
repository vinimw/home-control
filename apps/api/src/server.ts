import Fastify, { type FastifyInstance } from 'fastify';
import { API_HEALTH_PATH, type ApiErrorBody, type HealthResponse } from '@home-control/shared';
import { HTTP_STATUS_BY_CODE, HomeAssistantError } from './homeassistant/errors.js';
import { HomeAssistantService, type HomeAssistantSettings } from './homeassistant/service.js';
import { registerHomeAssistantRoutes } from './routes/homeassistant.js';

declare module 'fastify' {
  interface FastifyInstance {
    homeAssistant: HomeAssistantService;
  }
}

export interface ServerOptions {
  logLevel?: string;
  homeAssistant?: HomeAssistantSettings | null;
}

export function buildServer(options: ServerOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: {
      level: options.logLevel ?? 'info',
      // Defense in depth: credentials must never reach the logs.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          '*.token',
          '*.access_token',
          '*.authorization',
        ],
        censor: '[redacted]',
      },
    },
  });

  app.decorate('homeAssistant', new HomeAssistantService(options.homeAssistant ?? null, app.log));
  app.addHook('onClose', async () => app.homeAssistant.stop());

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HomeAssistantError) {
      request.log.warn({ code: error.code }, 'home assistant request failed');
      const body: ApiErrorBody = { error: error.toPayload() };
      return reply.status(HTTP_STATUS_BY_CODE[error.code]).send(body);
    }
    const { statusCode = 500, message } = error as { statusCode?: number; message: string };
    if (statusCode >= 400 && statusCode < 500) {
      const body: ApiErrorBody = {
        error: { code: statusCode === 404 ? 'not_found' : 'bad_request', message },
      };
      return reply.status(statusCode).send(body);
    }
    // Unknown failure: log the details, return nothing internal to the client.
    request.log.error({ err: error }, 'unhandled error');
    const body: ApiErrorBody = {
      error: { code: 'internal_error', message: 'Internal server error' },
    };
    return reply.status(500).send(body);
  });

  app.setNotFoundHandler((_request, reply) => {
    const body: ApiErrorBody = { error: { code: 'not_found', message: 'Route not found' } };
    return reply.status(404).send(body);
  });

  app.get<{ Reply: HealthResponse }>(API_HEALTH_PATH, async () => ({
    status: 'ok',
    service: 'home-control-api',
    timestamp: new Date().toISOString(),
  }));

  registerHomeAssistantRoutes(app);

  return app;
}
