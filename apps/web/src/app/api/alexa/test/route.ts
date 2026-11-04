import { API_ALEXA_TEST_PATH } from '@home-control/shared';
import { relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

export const POST = (request: Request) => relayJson(request, API_ALEXA_TEST_PATH, 'POST');
