import { HomeAssistantError } from './errors.js';
import type { HassConfig, HassState } from './types.js';

export interface RestClientOptions {
  /** Base URL without trailing slash, e.g. http://192.168.1.50:8123 */
  baseUrl: string;
  token: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
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

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw this.mapStatus(response.status);
    }

    try {
      return (await response.json()) as T;
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
