import { API_MEDIA_ACTIVITY_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export const GET = (request: Request) => relayJson(request, API_MEDIA_ACTIVITY_PATH, 'GET');
