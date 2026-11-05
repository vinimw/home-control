import type {
  ApiErrorBody,
  ApiErrorCode,
  CustomDevice,
  CustomDeviceAction,
  CustomDeviceExecutionResult,
  CustomDeviceInput,
  CustomDeviceListResponse,
  Room,
  RoomListResponse,
} from '@home-control/shared';
import { describeAlexaError } from './alexa-client';
import { csrfHeaders, redirectToLogin } from './csrf';

export type CustomResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code: ApiErrorCode | null;
      message: string;
      /** Present when the request WAS sent and failed: the card as the server now shows it. */
      result?: CustomDeviceExecutionResult;
    };

/** Reasons specific to custom cards, on top of the shared Alexa explanations. */
const MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  conflict:
    'Este botão não tem um comando válido, ou o mesmo comando já está sendo enviado. Nada foi enviado.',
  not_found: 'Esse cartão não existe mais. A lista foi atualizada.',
  invalid_params: 'Confira o cômodo e os comandos escolhidos.',
  bad_request: 'Confira o nome do cartão.',
  too_many_requests: 'Muitas solicitações. Aguarde um pouco e tente de novo.',
};

export const describeCustomError = (code: ApiErrorCode | null | undefined): string =>
  (code && MESSAGES[code]) || describeAlexaError(code);

async function request<T>(
  path: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<CustomResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      cache: 'no-store',
      headers: method === 'GET' ? {} : { 'content-type': 'application/json', ...csrfHeaders() },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, code: null, message: describeCustomError(null) };
  }
  if (response.status === 401) redirectToLogin();
  const payload = (await response.json().catch(() => null)) as unknown;
  if (response.ok) return { ok: true, data: (response.status === 204 ? null : payload) as T };
  // A sent-but-failed execution still carries the card and the cause in its body.
  const execution = payload as Partial<CustomDeviceExecutionResult> | null;
  const code =
    (payload as Partial<ApiErrorBody> | null)?.error?.code ?? execution?.error?.code ?? null;
  const result =
    execution && typeof execution === 'object' && 'device' in execution && execution.device
      ? (execution as CustomDeviceExecutionResult)
      : undefined;
  return { ok: false, code, message: describeCustomError(code), result };
}

export const listCustomDevices = () =>
  request<CustomDeviceListResponse>('/api/custom-devices', 'GET');
export const createCustomDevice = (input: CustomDeviceInput) =>
  request<CustomDevice>('/api/custom-devices', 'POST', input);
export const updateCustomDevice = (id: string, input: Partial<CustomDeviceInput>) =>
  request<CustomDevice>(`/api/custom-devices/${id}`, 'PATCH', input);
export const deleteCustomDevice = (id: string) =>
  request<null>(`/api/custom-devices/${id}`, 'DELETE');

/** Sends the command mapped to one button. Only called from an explicit Ligar/Desligar click. */
export const executeCustomDevice = (id: string, action: CustomDeviceAction) =>
  request<CustomDeviceExecutionResult>(`/api/custom-devices/${id}/execute`, 'POST', { action });

export const listRooms = () => request<RoomListResponse>('/api/rooms', 'GET');
export const saveRoomOrder = (ids: string[]) =>
  request<RoomListResponse>('/api/rooms/order', 'PUT', { ids });
export const createRoom = (name: string) => request<Room>('/api/rooms', 'POST', { name });
