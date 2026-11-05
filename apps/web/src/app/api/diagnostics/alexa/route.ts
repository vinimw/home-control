import { relayJson } from '@/lib/proxy';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  return relayJson(request, `/diagnostics/alexa${new URL(request.url).search}`, 'GET');
}
