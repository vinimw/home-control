import { API_CUSTOM_DEVICES_PATH } from '@home-control/shared';
import { errorResponse, isCustomDeviceId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCustomDeviceId(id)) return errorResponse('not_found', 'Custom device not found', 404);
  return relayJson(request, `${API_CUSTOM_DEVICES_PATH}/${id}/execute`, 'POST');
}
