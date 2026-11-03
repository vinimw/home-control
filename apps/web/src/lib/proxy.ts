import { API_DEVICES_PATH, type ApiErrorBody, type ApiErrorCode } from '@home-control/shared';
import { env } from './env';

/**
 * Server-side relay between the browser and the API. The browser only ever talks to this app (same
 * origin); the API stays on the internal network. Only the fixed routes under `app/api` use this, so the
 * browser can never reach an arbitrary API path.
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

/** Relays one JSON request to the API and returns its status and body unchanged. */
export async function relayJson(
  request: Request,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
): Promise<Response> {
  let body: string | undefined;
  if (method !== 'GET') {
    body = await request.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return errorResponse('bad_request', 'Request body is too large', 413);
    }
  }

  try {
    const upstream = await fetch(`${env.API_INTERNAL_URL}${path}`, {
      method,
      cache: 'no-store',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body,
      // Device actions can wait for confirmation (a few seconds) before answering.
      signal: AbortSignal.timeout(15_000),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return errorResponse('unreachable', 'The API could not be reached', 502);
  }
}
