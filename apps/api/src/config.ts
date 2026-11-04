import { resolve } from 'node:path';
import { z } from 'zod';

const port = z.coerce
  .number({ message: 'must be a number' })
  .int('must be an integer')
  .min(1, 'must be between 1 and 65535')
  .max(65535, 'must be between 1 and 65535');

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

const schema = z
  .object({
    API_HOST: z.string().trim().min(1).default('0.0.0.0'),
    API_PORT: port.default(3001),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATA_DIR: z.string().trim().min(1).default('./data'),
    HOME_ASSISTANT_URL: optionalString.pipe(
      z
        .url({
          protocol: /^https?$/,
          message: 'must be an http(s) URL, e.g. http://192.168.1.50:8123',
        })
        .optional(),
    ),
    HOME_ASSISTANT_TOKEN: optionalString,
    HOME_ASSISTANT_TIMEOUT_MS: z.coerce
      .number({ message: 'must be a number' })
      .int('must be an integer')
      .min(1000, 'must be between 1000 and 60000')
      .max(60_000, 'must be between 1000 and 60000')
      .default(10_000),
    // Unset means "on exactly when authentication is on".
    DEVICE_ACTIONS_ENABLED: optionalString.pipe(
      z
        .enum(['true', 'false', '1', '0'], { message: 'must be true or false' })
        .optional()
        .transform((value) =>
          value === undefined ? undefined : value === 'true' || value === '1',
        ),
    ),
    SPOTIFY_CLIENT_ID: optionalString,
    SPOTIFY_REDIRECT_URI: optionalString,
    APP_SECRET_KEY: optionalString,
    AUTH_ENABLED: z
      .enum(['true', 'false', '1', '0'], { message: 'must be true or false' })
      .default('true')
      .transform((value) => value === 'true' || value === '1'),
    AUTH_COOKIE_SECURE: z
      .enum(['auto', 'true', 'false'], { message: 'must be auto, true or false' })
      .default('auto'),
    NODE_ENV: optionalString,
    DEVICE_REFRESH_INTERVAL_MS: z.coerce
      .number({ message: 'must be a number' })
      .int('must be an integer')
      .min(5000, 'must be between 5000 and 3600000')
      .max(3_600_000, 'must be between 5000 and 3600000')
      .default(300_000),
  })
  .superRefine((env, ctx) => {
    if (env.SPOTIFY_CLIENT_ID && !env.SPOTIFY_REDIRECT_URI) {
      ctx.addIssue({
        code: 'custom',
        path: ['SPOTIFY_REDIRECT_URI'],
        message: 'is required when SPOTIFY_CLIENT_ID is set',
      });
    }
    if (env.SPOTIFY_REDIRECT_URI && !env.SPOTIFY_CLIENT_ID) {
      ctx.addIssue({
        code: 'custom',
        path: ['SPOTIFY_CLIENT_ID'],
        message: 'is required when SPOTIFY_REDIRECT_URI is set',
      });
    }
    if (env.SPOTIFY_REDIRECT_URI) {
      let url: URL | null = null;
      try {
        url = new URL(env.SPOTIFY_REDIRECT_URI);
      } catch {
        // reported below
      }
      const loopback =
        url && url.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(url.hostname);
      if (!url || !(url.protocol === 'https:' || loopback)) {
        ctx.addIssue({
          code: 'custom',
          path: ['SPOTIFY_REDIRECT_URI'],
          message:
            'must be https, or http on the loopback IP http://127.0.0.1:<port>/... (Spotify does not accept "localhost")',
        });
      }
    }
    if (env.APP_SECRET_KEY && Buffer.from(env.APP_SECRET_KEY, 'base64').length !== 32) {
      ctx.addIssue({
        code: 'custom',
        path: ['APP_SECRET_KEY'],
        message: 'must be 32 random bytes encoded as base64 (openssl rand -base64 32)',
      });
    }
    if (!env.AUTH_ENABLED && env.NODE_ENV === 'production') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_ENABLED'],
        message: 'cannot be false in production: authentication is mandatory outside development',
      });
    }
    if (env.HOME_ASSISTANT_URL && !env.HOME_ASSISTANT_TOKEN) {
      ctx.addIssue({
        code: 'custom',
        path: ['HOME_ASSISTANT_TOKEN'],
        message: 'is required when HOME_ASSISTANT_URL is set',
      });
    }
    if (env.HOME_ASSISTANT_TOKEN && !env.HOME_ASSISTANT_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['HOME_ASSISTANT_URL'],
        message: 'is required when HOME_ASSISTANT_TOKEN is set',
      });
    }
  });

export interface AppConfig {
  host: string;
  port: number;
  logLevel: string;
  dataDir: string;
  deviceRefreshIntervalMs: number;
  deviceActionsEnabled: boolean;
  /** False only for local development (refused when NODE_ENV=production). */
  authEnabled: boolean;
  authCookieSecure: 'auto' | boolean;
  /** Spotify app (public client: PKCE, no client secret). `null` when not configured. */
  spotify: { clientId: string; redirectUri: string } | null;
  /** Base64 key for encrypting tokens at rest; when unset a key file is created in the data directory. */
  appSecretKey: string | undefined;
  homeAssistant: { url: string; token: string; timeoutMs: number } | null;
}

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

export interface LoadConfigOptions {
  /** Fail when Home Assistant is not configured (used by `pnpm env:check`). */
  requireHomeAssistant?: boolean;
}

/**
 * Validates the environment. Error messages name the variable and the rule,
 * but never echo values, so secrets cannot leak into logs.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options: LoadConfigOptions = {},
): AppConfig {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`),
    );
  }

  const parsed = result.data;
  const url = parsed.HOME_ASSISTANT_URL;
  const token = parsed.HOME_ASSISTANT_TOKEN;

  if (options.requireHomeAssistant && !(url && token)) {
    throw new ConfigError(['HOME_ASSISTANT_URL: is required', 'HOME_ASSISTANT_TOKEN: is required']);
  }

  return {
    host: parsed.API_HOST,
    port: parsed.API_PORT,
    logLevel: parsed.LOG_LEVEL,
    dataDir: resolve(parsed.DATA_DIR),
    deviceRefreshIntervalMs: parsed.DEVICE_REFRESH_INTERVAL_MS,
    deviceActionsEnabled: parsed.DEVICE_ACTIONS_ENABLED ?? parsed.AUTH_ENABLED,
    spotify:
      parsed.SPOTIFY_CLIENT_ID && parsed.SPOTIFY_REDIRECT_URI
        ? { clientId: parsed.SPOTIFY_CLIENT_ID, redirectUri: parsed.SPOTIFY_REDIRECT_URI }
        : null,
    appSecretKey: parsed.APP_SECRET_KEY,
    authEnabled: parsed.AUTH_ENABLED,
    authCookieSecure:
      parsed.AUTH_COOKIE_SECURE === 'auto' ? 'auto' : parsed.AUTH_COOKIE_SECURE === 'true',
    homeAssistant:
      url && token
        ? { url: url.replace(/\/+$/, ''), token, timeoutMs: parsed.HOME_ASSISTANT_TIMEOUT_MS }
        : null,
  };
}
