import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { API_AUTH_PATH, API_HEALTH_PATH, CSRF_HEADER, SESSION_COOKIE } from '@home-control/shared';
import { ApiError } from '../errors.js';
import type { AuthSession } from './service.js';
import { WindowLimiter } from './throttle.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** The validated session, or `null` for public routes and when authentication is disabled. */
    authSession: AuthSession | null;
  }
}

/** Reachable without a session: liveness, "what should the login screen show", and the two ways in. */
const PUBLIC_ROUTES = new Set([
  `GET ${API_HEALTH_PATH}`,
  `GET ${API_AUTH_PATH}/session`,
  `POST ${API_AUTH_PATH}/login`,
  `POST ${API_AUTH_PATH}/setup`,
]);

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** State-changing requests allowed per session per minute. */
const WRITES_PER_MINUTE = 120;

export function readCookie(request: FastifyRequest, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

function csrfMatches(request: FastifyRequest, expected: string): boolean {
  const sent = request.headers[CSRF_HEADER];
  if (typeof sent !== 'string') return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Default-deny gate: every route needs a valid session unless it is listed above. Unknown paths are also
 * answered with 401 first, so an unauthenticated client cannot probe which routes exist.
 */
export function registerAuthGate(app: FastifyInstance): void {
  app.decorateRequest('authSession', null);
  const writes = new WindowLimiter(WRITES_PER_MINUTE, 60_000);

  app.addHook('onRequest', async (request, reply) => {
    // Responses may carry personal data or session state: never cache them.
    reply.header('cache-control', 'no-store');
    reply.header('x-content-type-options', 'nosniff');

    if (!app.auth.enabled) return;

    const path = request.url.split('?')[0] ?? '';
    if (PUBLIC_ROUTES.has(`${request.method} ${path}`)) return;

    const session = app.auth.authenticate(readCookie(request, SESSION_COOKIE));
    if (!session) throw new ApiError('auth_required', 'Authentication required');

    if (!SAFE_METHODS.has(request.method)) {
      if (!csrfMatches(request, session.csrfToken)) {
        throw new ApiError('csrf_invalid', 'Missing or invalid CSRF token');
      }
      if (!writes.take(session.idHash)) {
        reply.header('retry-after', '60');
        throw new ApiError('too_many_requests', 'Too many requests. Slow down.');
      }
    }
    request.authSession = session;
  });
}
