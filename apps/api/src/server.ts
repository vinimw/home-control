import Fastify, { type FastifyInstance } from 'fastify';
import { API_HEALTH_PATH, type ApiErrorBody, type HealthResponse } from '@home-control/shared';
import { registerAuthGate } from './auth/plugin.js';
import { AuthService } from './auth/service.js';
import { ApiError, HTTP_STATUS_BY_CODE } from './errors.js';
import { DeviceActionService } from './devices/actions/service.js';
import { DeviceCatalog } from './devices/catalog.js';
import { DeviceEventHub } from './devices/events.js';
import { DeviceRegistry } from './devices/registry.js';
import { HomeAssistantService, type HomeAssistantSettings } from './homeassistant/service.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerRoomRoutes } from './routes/rooms.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerSpotifyRoutes } from './routes/spotify.js';
import { SecretBox } from './spotify/secret-box.js';
import { SpotifyService, type SpotifyEndpoints, type SpotifySettings } from './spotify/service.js';
import { Storage } from './storage/index.js';
import { registerHomeAssistantRoutes } from './routes/homeassistant.js';

declare module 'fastify' {
  interface FastifyInstance {
    homeAssistant: HomeAssistantService;
    storage: Storage;
    auth: AuthService;
    spotify: SpotifyService;
    devices: DeviceRegistry;
    catalog: DeviceCatalog;
    deviceEvents: DeviceEventHub;
    deviceActions: DeviceActionService;
  }
}

export interface ServerOptions {
  /** Persistent storage. Defaults to a non-persistent in-memory database (tests); production passes a file. */
  storage?: Storage;
  logLevel?: string;
  homeAssistant?: HomeAssistantSettings | null;
  deviceRefreshIntervalMs?: number;
  /** Launchable TV applications (name -> id). */
  tvApps?: Record<string, string>;
  /** Explicit media player -> remote entity pairs. */
  deviceLinks?: Record<string, string>;
  /** Spotify app settings (`null`/absent: not configured). `endpoints` is only overridden by tests. */
  spotify?: SpotifySettings & { endpoints?: SpotifyEndpoints };
  /** Key for encrypting stored tokens. A random one per process when absent (tests). */
  secrets?: SecretBox;
  /** Device actions can be switched off independently of authentication. */
  deviceActions?: { enabled: boolean; confirmTimeoutMs?: number };
  /**
   * Authentication. Off by default so `buildServer()` stays usable in isolation; the real entry point
   * (`index.ts`) turns it on.
   */
  auth?: {
    enabled: boolean;
    cookieSecure?: 'auto' | boolean;
    idleTtlMs?: number;
    absoluteTtlMs?: number;
  };
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
  app.decorate('storage', options.storage ?? Storage.openInMemory());
  app.decorate(
    'spotify',
    new SpotifyService({
      settings: options.spotify
        ? { clientId: options.spotify.clientId, redirectUri: options.spotify.redirectUri }
        : null,
      endpoints: options.spotify?.endpoints,
      repo: app.storage.spotify,
      secrets: options.secrets ?? SecretBox.random(),
      logger: app.log,
    }),
  );
  app.decorate(
    'auth',
    new AuthService(app.storage.auth, {
      enabled: options.auth?.enabled ?? false,
      logger: app.log,
      idleTtlMs: options.auth?.idleTtlMs,
      absoluteTtlMs: options.auth?.absoluteTtlMs,
    }),
  );
  const tvApps = new Map(Object.entries(options.tvApps ?? {}));
  app.decorate(
    'devices',
    new DeviceRegistry({
      service: app.homeAssistant,
      logger: app.log,
      refreshIntervalMs: options.deviceRefreshIntervalMs ?? 300_000,
      links: options.deviceLinks,
      apps: tvApps,
    }),
  );
  app.decorate('catalog', new DeviceCatalog(app.devices, app.storage));
  app.decorate('deviceEvents', new DeviceEventHub((id) => app.catalog.get(id)));
  app.devices.onChange((id) => app.deviceEvents.device(id));
  app.devices.onResync((reason) => app.deviceEvents.resync(reason));
  app.decorate(
    'deviceActions',
    new DeviceActionService({
      registry: app.devices,
      homeAssistant: app.homeAssistant,
      logger: app.log,
      view: (id) => app.catalog.get(id),
      apps: tvApps,
      enabled: options.deviceActions?.enabled ?? false,
      confirmTimeoutMs: options.deviceActions?.confirmTimeoutMs,
    }),
  );
  registerAuthGate(app);
  const purgeTimer = setInterval(() => app.auth.purgeExpired(), 60 * 60 * 1000);
  purgeTimer.unref();
  app.addHook('onClose', async () => {
    clearInterval(purgeTimer);
    app.devices.stop();
    app.homeAssistant.stop();
    app.storage.close();
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      request.log.warn({ code: error.code }, 'request failed');
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

  registerAuthRoutes(app, { secure: options.auth?.cookieSecure ?? 'auto' });
  registerHomeAssistantRoutes(app);
  registerDeviceRoutes(app);
  registerRoomRoutes(app);
  registerSettingsRoutes(app);
  registerSpotifyRoutes(app);

  return app;
}
