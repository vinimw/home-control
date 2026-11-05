import type {
  ApiErrorBody,
  ApiErrorCode,
  Scene,
  SceneInput,
  SceneListResponse,
  ScenePresetInstallResponse,
  ScenePresetListResponse,
  SceneRun,
} from '@home-control/shared';
import { csrfHeaders, redirectToLogin } from './csrf';

export type SceneResult<T> =
  { ok: true; data: T } | { ok: false; code: ApiErrorCode | null; message: string };

const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  actions_disabled: 'As ações nos dispositivos estão desativadas no servidor. Nada foi executado.',
  conflict: 'Esta cena já está rodando, ou já existe uma cena com esse nome.',
  not_found: 'Essa cena não existe mais. A lista foi atualizada.',
  invalid_params: 'Algum passo não é aceito pelo dispositivo agora. Confira os passos.',
  bad_request: 'Confira o nome e os passos da cena.',
  device_unavailable: 'Nenhum passo desta cena está disponível agora.',
  too_many_requests: 'Muitas solicitações. Aguarde um pouco e tente de novo.',
  csrf_invalid: 'A solicitação foi recusada por segurança. Recarregue a página.',
  unreachable: 'Não foi possível falar com o servidor.',
  timeout: 'O servidor demorou demais para responder.',
};
const FALLBACK = 'Não foi possível concluir. Tente de novo.';

export const describeSceneError = (code: ApiErrorCode | null | undefined): string =>
  (code && MESSAGES[code]) || FALLBACK;

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<SceneResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: 'no-store',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', ...csrfHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: null, message: describeSceneError(null) };
  }
  if (response.status === 401) redirectToLogin();
  const payload = (await response.json().catch(() => null)) as unknown;
  if (response.ok) return { ok: true, data: (response.status === 204 ? null : payload) as T };
  const code = (payload as Partial<ApiErrorBody> | null)?.error?.code ?? null;
  return { ok: false, code, message: describeSceneError(code) };
}

export const listScenes = () => request<SceneListResponse>('/api/scenes', 'GET');
export const createScene = (input: SceneInput) => request<Scene>('/api/scenes', 'POST', input);
export const updateScene = (id: string, input: Partial<SceneInput>) =>
  request<Scene>(`/api/scenes/${id}`, 'PATCH', input);
export const deleteScene = (id: string) => request<null>(`/api/scenes/${id}`, 'DELETE');
/** Only called from an explicit "Executar" click. */
export const runScene = (id: string) => request<SceneRun>(`/api/scenes/${id}/run`, 'POST');
export const listScenePresets = () =>
  request<ScenePresetListResponse>('/api/scenes/presets', 'GET');
export const installScenePreset = (key: string) =>
  request<ScenePresetInstallResponse>(`/api/scenes/presets/${key}/install`, 'POST');
