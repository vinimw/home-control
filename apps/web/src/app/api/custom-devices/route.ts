import { API_CUSTOM_DEVICES_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => relayJson(request, API_CUSTOM_DEVICES_PATH, 'GET');
export const POST = (request: Request) => relayJson(request, API_CUSTOM_DEVICES_PATH, 'POST');
