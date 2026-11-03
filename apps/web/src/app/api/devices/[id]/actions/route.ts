import { devicePath, errorResponse, isDeviceId, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isDeviceId(id)) return errorResponse('not_found', 'Device not found', 404);
  return relayJson(request, devicePath(`/${id}/actions`), 'POST');
}
