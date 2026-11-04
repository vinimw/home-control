import {
  API_DEVICES_PATH,
  CSRF_HEADER,
  type ApiErrorBody,
  type ApiErrorCode,
} from '@home-control/shared';
import { env } from './env';

/**
 * Server-side relay between the browser and the API. The browser only ever talks to this app (same
 * origin); the API stays on the internal network. Only the fixed routes under `app/api` use this, so the
 * browser can never reach an arbitrary API path. The session cookie and the CSRF header are passed
 * through; the API is the one that validates them.
 */

const DEVICE_ID = /^dev_[0-9a-f]{16}$/;
const MAX_BODY_BYTES = 16 * 1024;

export function errorResponse(code: ApiErrorCode, message: string, status: number): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

export function isDeviceId(value: string): boolean {
  return DEVICE_ID.test(value);
}

export const devicePath = (suffix = ''): string => `${API_DEVICES_PATH}${suffix}`;

/** Headers that identify the user to the API. Nothing else from the browser is forwarded. */
export function forwardedHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const cookie = request.headers.get('cookie');
  if (cookie) headers.cookie = cookie;
  const csrf = request.headers.get(CSRF_HEADER);
  if (csrf) headers[CSRF_HEADER] = csrf;
  // Lets the API mark the session cookie `Secure` when the user reached us over HTTPS.
  const proto =
    request.headers.get('x-forwarded-proto') ?? new URL(request.url).protocol.replace(':', '');
  headers['x-forwarded-proto'] = proto.split(',')[0]!.trim();
  return headers;
}

/**
 * Cross-site request guard for state-changing requests: a browser always says where a request came from,
 * so anything that is not from this very site is refused before it reaches the API. (The CSRF token and
 * the SameSite cookie are further layers.)
 */
export function crossSiteRejection(request: Request): Response | null {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    return errorResponse('csrf_invalid', 'Cross-site request refused', 403);
  }
  const origin = request.headers.get('origin');
  if (origin) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      return errorResponse('csrf_invalid', 'Cross-site request refused', 403);
    }
    if (originHost !== request.headers.get('host')) {
      return errorResponse('csrf_invalid', 'Cross-site request refused', 403);
    }
  }
  return null;
}

/** Relays one JSON request to the API and returns its status, body and `Set-Cookie` unchanged. */
export async function relayJson(
  request: Request,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
): Promise<Response> {
  let body: string | undefined;
  if (method !== 'GET') {
    const rejected = crossSiteRejection(request);
    if (rejected) return rejected;
    body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return errorResponse('bad_request', 'Request body is too large', 413);
    }
  }

  const headers = forwardedHeaders(request);
  if (body) headers['content-type'] = 'application/json';

  try {
    const upstream = await fetch(`${env.API_INTERNAL_URL}${path}`, {
      method,
      cache: 'no-store',
      headers,
      body: body || undefined,
      // Device actions can wait for confirmation (a few seconds) before answering.
      signal: AbortSignal.timeout(15_000),
      redirect: 'manual',
    });
    const out = new Headers({
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      'cache-control': 'no-store',
    });
    const retryAfter = upstream.headers.get('retry-after');
    if (retryAfter) out.set('retry-after', retryAfter);
    for (const cookie of upstream.headers.getSetCookie()) out.append('set-cookie', cookie);
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return errorResponse('unreachable', 'The API could not be reached', 502);
  }
}
