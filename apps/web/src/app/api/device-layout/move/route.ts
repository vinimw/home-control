import { API_DEVICE_LAYOUT_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export function POST(request: Request) {
  return relayJson(request, `${API_DEVICE_LAYOUT_PATH}/move`, 'POST');
}
