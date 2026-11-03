import { devicePath, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  const { search } = new URL(request.url);
  return relayJson(request, devicePath(search), 'GET');
}
