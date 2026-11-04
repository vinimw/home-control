import { API_CUSTOM_DEVICES_PATH } from '@home-control/shared';
import { errorResponse, isCustomDeviceId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isCustomDeviceId(id)) return errorResponse('not_found', 'Custom device not found', 404);
  return relayJson(request, `${API_CUSTOM_DEVICES_PATH}/${id}`, 'PATCH');
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isCustomDeviceId(id)) return errorResponse('not_found', 'Custom device not found', 404);
  return relayJson(request, `${API_CUSTOM_DEVICES_PATH}/${id}`, 'DELETE');
}
