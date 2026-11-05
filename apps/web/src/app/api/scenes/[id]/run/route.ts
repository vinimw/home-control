import { API_SCENES_PATH } from '@home-control/shared';
import { errorResponse, isSceneId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

/** Runs a saved scene. The browser never sends commands: only which scene. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSceneId(id)) return errorResponse('not_found', 'Scene not found', 404);
  return relayJson(request, `${API_SCENES_PATH}/${id}/run`, 'POST');
}
