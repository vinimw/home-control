import { API_ALEXA_COMMANDS_PATH } from '@home-control/shared';
import { errorResponse, isCommandId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isCommandId(id)) return errorResponse('not_found', 'Alexa command not found', 404);
  return relayJson(request, `${API_ALEXA_COMMANDS_PATH}/${id}/execute`, 'POST');
}
