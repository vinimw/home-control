import { API_SCENES_PATH } from '@home-control/shared';
import { errorResponse, relayJson, SCENE_PRESET_KEY } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!SCENE_PRESET_KEY.test(key)) return errorResponse('not_found', 'Preset not found', 404);
  return relayJson(request, `${API_SCENES_PATH}/presets/${key}/install`, 'POST');
}
