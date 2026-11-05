import { API_ROOMS_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export const PUT = (request: Request) => relayJson(request, `${API_ROOMS_PATH}/order`, 'PUT');
