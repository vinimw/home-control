import { randomUUID } from 'node:crypto';
import { diagnosticContext, safeRequest, responseShape, type Observe } from '../diagnostics.js';
import { HomeAssistantError } from './errors.js';
import type { HassConfig, HassState } from './types.js';

export interface RestClientOptions {
  /** Base URL without trailing slash, e.g. http://192.168.1.50:8123 */
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  observe?: Observe;
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const SLUG = /^[a-z0-9_]+$/;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

/** Typed, timeout-aware client for the Home Assistant REST API. */
export class HomeAssistantRestClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: RestClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  getApiStatus(): Promise<{ message: string }> {
    return this.request('GET', '/api/');
  }

  getConfig(): Promise<HassConfig> {
    return this.request('GET', '/api/config');
  }

  getStates(): Promise<HassState[]> {
    return this.request('GET', '/api/states');
  }

  getState(entityId: string): Promise<HassState> {
    if (!ENTITY_ID.test(entityId)) {
      throw new HomeAssistantError('bad_request', 'Invalid entity id');
    }
    return this.request('GET', `/api/states/${entityId}`);
  }

  /** Calls a service, e.g. callService('media_player', 'media_play', { entity_id }). */
  callService(
    domain: string,
    service: string,
    data: Record<string, unknown> = {},
  ): Promise<HassState[]> {
    if (!SLUG.test(domain) || !SLUG.test(service)) {
      throw new HomeAssistantError('bad_request', 'Invalid service domain or name');
    }
    return this.request('POST', `/api/services/${domain}/${service}`, data);
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const { baseUrl, token, timeoutMs } = this.options;
    const signal = AbortSignal.timeout(timeoutMs);
    const timeoutError = (cause: unknown) =>
      new HomeAssistantError('timeout', `Home Assistant did not respond within ${timeoutMs} ms`, {
        cause,
      });

    const id = randomUUID();
    const operationId = diagnosticContext.getStore()?.operationId ?? randomUUID();
    const at = new Date().toISOString();
    const started = performance.now();
    let status: number | null = null;
    let outcome = 'ok';
    let received: Record<string, unknown> = {};
    try {
      try {
        this.options.observe?.({
          id,
          operationId,
          kind: 'rest',
          at,
          action: method + ' ' + path,
          outcome: 'pending',
          request: safeRequest(body),
        });
      } catch {
        /* isolated observer */
      }
      let response: Response;
      try {
        response = await this.fetchImpl(`${baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (isTimeout(error)) throw timeoutError(error);
        throw new HomeAssistantError('unreachable', 'Could not connect to Home Assistant', {
          cause: error,
        });
      }

      status = response.status;
      received = {
        httpStatus: status,
        retryAfter: response.headers.get('retry-after')?.match(/^\d{1,8}$/)?.[0] ?? null,
      };
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw this.mapStatus(response.status);
      }

      try {
        const result = (await response.json()) as T;
        received = { ...received, ...responseShape(result) };
        return result;
      } catch (error) {
        if (isTimeout(error)) throw timeoutError(error);
        throw new HomeAssistantError(
          'invalid_response',
          'Home Assistant returned an invalid response',
          {
            cause: error,
          },
        );
      }
    } catch (error) {
      outcome = error instanceof HomeAssistantError ? error.code : 'failed';
      throw error;
    } finally {
      try {
        this.options.observe?.({
          id,
          operationId,
          kind: 'rest',
          at,
          completedAt: new Date().toISOString(),
          action: method + ' ' + path,
          target: path.startsWith('/api/services/') ? path.slice(14) : null,
          outcome,
          status,
          durationMs: Math.round((performance.now() - started) * 100) / 100,
          request: safeRequest(body),
          response: received,
        });
      } catch {
        /* isolated observer */
      }
    }
  }

  private mapStatus(status: number): HomeAssistantError {
    if (status === 401 || status === 403) {
      return new HomeAssistantError('unauthorized', 'Home Assistant rejected the access token');
    }
    if (status === 404) {
      return new HomeAssistantError('not_found', 'Home Assistant resource not found');
    }
    if (status === 400) {
      return new HomeAssistantError('bad_request', 'Home Assistant rejected the request');
    }
    return new HomeAssistantError('upstream_error', `Home Assistant returned HTTP ${status}`);
  }
}
