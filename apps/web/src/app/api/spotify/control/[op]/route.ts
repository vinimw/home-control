import { API_SPOTIFY_CONTROL_PATH } from '@home-control/shared';
import { errorResponse, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ op: string }> };

/** Fixed allowlist: the only control operations the browser can reach, each with its one method. */
export async function GET(request: Request, { params }: Context) {
  const { op } = await params;
  if (op !== 'state') return errorResponse('not_found', 'Not found', 404);
  return relayJson(request, `${API_SPOTIFY_CONTROL_PATH}/state`, 'GET');
}

export async function POST(request: Request, { params }: Context) {
  const { op } = await params;
  if (!['command', 'transfer', 'playlist', 'track', 'seek'].includes(op)) {
    return errorResponse('not_found', 'Not found', 404);
  }
  return relayJson(request, `${API_SPOTIFY_CONTROL_PATH}/${op}`, 'POST');
}
