import { API_DEVICE_LAYOUT_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export function GET(request: Request) {
  return relayJson(request, API_DEVICE_LAYOUT_PATH, 'GET');
}

export function PATCH(request: Request) {
  return relayJson(request, API_DEVICE_LAYOUT_PATH, 'PATCH');
}
