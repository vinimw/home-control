import { API_SPOTIFY_LIBRARY_PATH } from '@home-control/shared';
import { errorResponse, relayJson } from '@/lib/proxy';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ path: string[] }> };
type Method = 'GET' | 'PUT' | 'DELETE';

const ID = '[A-Za-z0-9]{1,64}';
/** Fixed allowlist: the only library paths the browser can reach, each with its allowed methods. */
const ROUTES: Array<{ pattern: RegExp; methods: readonly Method[] }> = [
  { pattern: /^search$/, methods: ['GET'] },
  { pattern: /^saved$/, methods: ['GET'] },
  { pattern: new RegExp(`^playlists/${ID}/tracks$`), methods: ['GET'] },
  { pattern: new RegExp(`^saved/${ID}$`), methods: ['PUT', 'DELETE'] },
];

async function handle(request: Request, { params }: Context, method: Method) {
  const path = (await params).path.join('/');
  if (!ROUTES.some((route) => route.pattern.test(path) && route.methods.includes(method))) {
    return errorResponse('not_found', 'Not found', 404);
  }
  const search = method === 'GET' ? new URL(request.url).search : '';
  return relayJson(request, `${API_SPOTIFY_LIBRARY_PATH}/${path}${search}`, method);
}

export const GET = (request: Request, context: Context) => handle(request, context, 'GET');
export const PUT = (request: Request, context: Context) => handle(request, context, 'PUT');
export const DELETE = (request: Request, context: Context) => handle(request, context, 'DELETE');
