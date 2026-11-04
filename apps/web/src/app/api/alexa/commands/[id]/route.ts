import { API_ALEXA_COMMANDS_PATH } from '@home-control/shared';
import { errorResponse, isCommandId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isCommandId(id)) return errorResponse('not_found', 'Alexa command not found', 404);
  return relayJson(request, `${API_ALEXA_COMMANDS_PATH}/${id}`, 'PATCH');
}

export async function DELETE(request: Request, { params }: Context) {
  const { id } = await params;
  if (!isCommandId(id)) return errorResponse('not_found', 'Alexa command not found', 404);
  return relayJson(request, `${API_ALEXA_COMMANDS_PATH}/${id}`, 'DELETE');
}
