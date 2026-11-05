import { API_SPOTIFY_PLAYER_PATH } from '@home-control/shared';
import { errorResponse, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

/** Fixed allowlist of player operations the browser can reach. */
const OPERATIONS = new Set(['command', 'source', 'playlist']);

export async function POST(request: Request, { params }: { params: Promise<{ op: string }> }) {
  const { op } = await params;
  if (!OPERATIONS.has(op)) return errorResponse('not_found', 'Not found', 404);
  return relayJson(request, `${API_SPOTIFY_PLAYER_PATH}/${op}`, 'POST');
}
