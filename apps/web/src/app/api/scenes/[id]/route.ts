import { API_SCENES_PATH } from '@home-control/shared';
import { errorResponse, isSceneId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isSceneId(id)) return errorResponse('not_found', 'Scene not found', 404);
  return relayJson(request, `${API_SCENES_PATH}/${id}`, 'PATCH');
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isSceneId(id)) return errorResponse('not_found', 'Scene not found', 404);
  return relayJson(request, `${API_SCENES_PATH}/${id}`, 'DELETE');
}
