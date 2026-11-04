import { z } from 'zod';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { API_AUTH_PATH, SESSION_COOKIE, type AuthSessionResponse } from '@home-control/shared';
import { readCookie } from '../auth/plugin.js';
import { ApiError } from '../errors.js';
import { parseOrThrow } from './validation.js';

const setupBody = z
  .object({ setupCode: z.string().max(32), password: z.string().max(1024) })
  .strict();
const loginBody = z.object({ password: z.string().max(1024) }).strict();
const passwordBody = z
  .object({ currentPassword: z.string().max(1024), newPassword: z.string().max(1024) })
  .strict();

export interface CookieOptions {
  /** `auto` marks the cookie Secure when the request arrived over HTTPS (behind the web app). */
  secure: 'auto' | boolean;
}

function isHttps(request: FastifyRequest): boolean {
  const forwarded = request.headers['x-forwarded-proto'];
  return (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) === 'https';
}

export function registerAuthRoutes(app: FastifyInstance, cookies: CookieOptions): void {
  const setCookie = (
    request: FastifyRequest,
    reply: FastifyReply,
    value: string,
    maxAgeSeconds: number,
  ): void => {
    const secure = cookies.secure === 'auto' ? isHttps(request) : cookies.secure;
    reply.header(
      'set-cookie',
      [
        `${SESSION_COOKIE}=${value}`,
        'Path=/',
        'HttpOnly',
        // Lax still lets the cookie travel on top-level navigations (opening the app from a link).
        'SameSite=Lax',
        `Max-Age=${maxAgeSeconds}`,
        ...(secure ? ['Secure'] : []),
      ].join('; '),
    );
  };

  const withRetryAfter = async <T>(reply: FastifyReply, work: () => Promise<T>): Promise<T> => {
    try {
      return await work();
    } catch (error) {
      const wait = app.auth.retryAfterSeconds();
      if (error instanceof ApiError && error.code === 'too_many_requests' && wait > 0) {
        reply.header('retry-after', String(wait));
      }
      throw error;
    }
  };

  app.get<{ Reply: AuthSessionResponse }>(`${API_AUTH_PATH}/session`, async (request) => {
    if (!app.auth.enabled) return { configured: true, authenticated: true, csrfToken: null };
    const session = app.auth.authenticate(readCookie(request, SESSION_COOKIE));
    return {
      configured: app.auth.configured,
      authenticated: session !== null,
      csrfToken: session?.csrfToken ?? null,
    };
  });

  app.post<{ Reply: AuthSessionResponse }>(
    `${API_AUTH_PATH}/setup`,
    { bodyLimit: 4 * 1024 },
    async (request, reply) => {
      const body = parseOrThrow(setupBody, request.body, 'body');
      const issued = await withRetryAfter(reply, () =>
        app.auth.setup(body.setupCode, body.password),
      );
      setCookie(request, reply, issued.token, app.auth.cookieMaxAgeSeconds);
      return reply.status(201).send({
        configured: true,
        authenticated: true,
        csrfToken: issued.session.csrfToken,
      });
    },
  );

  app.post<{ Reply: AuthSessionResponse }>(
    `${API_AUTH_PATH}/login`,
    { bodyLimit: 4 * 1024 },
    async (request, reply) => {
      const body = parseOrThrow(loginBody, request.body, 'body');
      const issued = await withRetryAfter(reply, () => app.auth.login(body.password));
      setCookie(request, reply, issued.token, app.auth.cookieMaxAgeSeconds);
      return { configured: true, authenticated: true, csrfToken: issued.session.csrfToken };
    },
  );

  app.post(`${API_AUTH_PATH}/logout`, async (request, reply) => {
    const token = readCookie(request, SESSION_COOKIE);
    if (token) app.auth.logout(token);
    // Expire the cookie in the browser as well.
    setCookie(request, reply, '', 0);
    return reply.status(204).send();
  });

  app.post(`${API_AUTH_PATH}/password`, { bodyLimit: 4 * 1024 }, async (request, reply) => {
    const session = request.authSession;
    if (!session) throw new ApiError('auth_required', 'Authentication required');
    const body = parseOrThrow(passwordBody, request.body, 'body');
    await withRetryAfter(reply, () =>
      app.auth.changePassword(session.idHash, body.currentPassword, body.newPassword),
    );
    return reply.status(204).send();
  });
}
