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
  })
  .superRefine((env, ctx) => {
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
    homeAssistant:
      url && token
        ? { url: url.replace(/\/+$/, ''), token, timeoutMs: parsed.HOME_ASSISTANT_TIMEOUT_MS }
        : null,
  };
}
