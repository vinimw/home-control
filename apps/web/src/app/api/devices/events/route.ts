import { API_DEVICE_EVENTS_PATH } from '@home-control/shared';
import { env } from '@/lib/env';
import { errorResponse, forwardedHeaders } from '@/lib/proxy';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Streams the API's Server-Sent Events to the browser, closing the upstream when the browser leaves. */
export async function GET(request: Request) {
  try {
    const upstream = await fetch(`${env.API_INTERNAL_URL}${API_DEVICE_EVENTS_PATH}`, {
      cache: 'no-store',
      headers: { accept: 'text/event-stream', ...forwardedHeaders(request) },
      signal: request.signal,
    });
    if (upstream.status === 401) {
      return errorResponse('auth_required', 'Authentication required', 401);
    }
    if (!upstream.ok || !upstream.body) {
      return errorResponse('unreachable', 'The event stream is not available', 502);
    }
    return new Response(upstream.body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        // `no-transform` also keeps compression from buffering the stream.
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    });
  } catch {
    return errorResponse('unreachable', 'The API could not be reached', 502);
  }
}
