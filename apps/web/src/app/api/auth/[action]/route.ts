import { API_AUTH_PATH } from '@home-control/shared';
import { errorResponse, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

/** Fixed allowlist: the only auth endpoints the browser can reach. */
const ACTIONS: Record<string, 'GET' | 'POST'> = {
  session: 'GET',
  login: 'POST',
  setup: 'POST',
  logout: 'POST',
  password: 'POST',
};

async function handle(
  request: Request,
  params: Promise<{ action: string }>,
  method: 'GET' | 'POST',
) {
  const { action } = await params;
  if (!Object.hasOwn(ACTIONS, action) || ACTIONS[action] !== method) {
    return errorResponse('not_found', 'Not found', 404);
  }
  return relayJson(request, `${API_AUTH_PATH}/${action}`, method);
}

export function GET(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handle(request, params, 'GET');
}

export function POST(request: Request, { params }: { params: Promise<{ action: string }> }) {
  return handle(request, params, 'POST');
}
