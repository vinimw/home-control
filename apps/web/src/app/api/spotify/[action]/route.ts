import { API_SPOTIFY_PATH } from '@home-control/shared';
import { env } from '@/lib/env';
import { errorResponse, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

/** Fixed allowlist: the only Spotify endpoints the browser can reach, each with its one method. */
const ACTIONS: Record<string, readonly ('GET' | 'POST' | 'PUT' | 'DELETE')[]> = {
  status: ['GET'],
  playlists: ['GET'],
  devices: ['GET'],
  playback: ['GET'],
  connect: ['POST'],
  disconnect: ['POST'],
  callback: ['GET'],
  // Saved app registration (Client ID + callback) and the read-only connection test.
  config: ['PUT', 'DELETE'],
  test: ['POST'],
};

/** Only these outcomes may be sent back to the browser, so the redirect can never be steered elsewhere. */
const OUTCOMES = new Set(['connected', 'denied', 'error']);

/**
 * Spotify sends the browser here after the user approves (or cancels). The code and state are handed to the
 * API, which validates the single-use state and keeps the tokens. The browser only ever gets a redirect to
 * the settings page with a short outcome, never a token.
 */
async function callback(request: Request): Promise<Response> {
  const { search } = new URL(request.url);
  let outcome = 'error';
  try {
    const upstream = await fetch(`${env.API_INTERNAL_URL}${API_SPOTIFY_PATH}/callback${search}`, {
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    const found = new URL(upstream.headers.get('location') ?? '', 'http://x').searchParams.get(
      'spotify',
    );
    if (found && OUTCOMES.has(found)) outcome = found;
  } catch {
    // unreachable API: the settings page explains it
  }
  return new Response(null, {
    status: 302,
    headers: { location: `/settings?spotify=${outcome}`, 'cache-control': 'no-store' },
  });
}

async function handle(
  request: Request,
  params: Promise<{ action: string }>,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
) {
  const { action } = await params;
  if (!Object.hasOwn(ACTIONS, action) || !ACTIONS[action]?.includes(method)) {
    return errorResponse('not_found', 'Not found', 404);
  }
  if (action === 'callback') return callback(request);
  return relayJson(request, `${API_SPOTIFY_PATH}/${action}`, method);
}

export function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handle(request, params, 'GET');
}

export function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handle(request, params, 'POST');
}

export function PUT(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handle(request, params, 'PUT');
}

export function DELETE(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handle(request, params, 'DELETE');
}
