import { createHash, randomBytes } from 'node:crypto';
import type {
  ApiErrorCode,
  SpotifyDevice,
  SpotifyDevicesResponse,
  SpotifyPlayback,
  SpotifyPlaybackResponse,
  SpotifyPlaylistsResponse,
  SpotifyStatus,
} from '@home-control/shared';
import { ApiError } from '../errors.js';
import type { Logger } from '../homeassistant/types.js';
import type { SpotifyConnectionRecord, SpotifyRepository } from '../storage/index.js';
import type { SecretBox } from './secret-box.js';

export interface SpotifySettings {
  clientId: string;
  redirectUri: string;
}

export interface SpotifyEndpoints {
  accountsUrl: string;
  apiUrl: string;
}

export const DEFAULT_SPOTIFY_ENDPOINTS: SpotifyEndpoints = {
  accountsUrl: 'https://accounts.spotify.com',
  apiUrl: 'https://api.spotify.com/v1',
};

/**
 * Read-only permissions: account, playback state, playlists. Controlling playback needs
 * `user-modify-playback-state`; it is deliberately NOT requested until a feature uses it.
 */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
] as const;

export interface SpotifyServiceOptions {
  settings: SpotifySettings | null;
  repo: SpotifyRepository;
  secrets: SecretBox;
  logger: Logger;
  endpoints?: SpotifyEndpoints;
  clock?: () => number;
  /** Per-request timeout. */
  timeoutMs?: number;
}

interface PendingAuthorization {
  verifier: string;
  createdAt: number;
}

interface TokenResponse {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
}

/** Internal: Spotify rejected the access token (expired or revoked). Never leaves this module. */
class TokenRejected extends Error {}

const PENDING_TTL_MS = 10 * 60_000;
const MAX_PENDING = 10;
/** Refresh a little early so a token never expires mid-request. */
const REFRESH_MARGIN_MS = 60_000;
const PLAYLIST_PAGE = 50;

const b64url = (buffer: Buffer): string => buffer.toString('base64url');

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

/**
 * Spotify OAuth (Authorization Code with PKCE: a public client, so there is no client secret to protect),
 * token refresh and the read-only Web API calls. Tokens stay on the server, encrypted at rest.
 */
export class SpotifyService {
  private readonly pending = new Map<string, PendingAuthorization>();
  private refreshing: Promise<string> | null = null;
  private readonly endpoints: SpotifyEndpoints;
  private readonly clock: () => number;

  constructor(private readonly options: SpotifyServiceOptions) {
    this.endpoints = options.endpoints ?? DEFAULT_SPOTIFY_ENDPOINTS;
    this.clock = options.clock ?? Date.now;
  }

  get configured(): boolean {
    return this.options.settings !== null;
  }

  status(): SpotifyStatus {
    const record = this.options.repo.get();
    const connected =
      record !== undefined && !record.reauthRequired && record.refreshTokenEnc !== null;
    return {
      configured: this.configured,
      connected,
      reauthRequired: record?.reauthRequired ?? false,
      account: record
        ? { id: record.userId, displayName: record.displayName, product: record.product }
        : null,
      scopes: record ? record.scope.split(' ').filter(Boolean) : [],
      connectedAt: record?.connectedAt ?? null,
      lastError:
        record?.lastErrorCode && record.lastErrorMessage
          ? { code: record.lastErrorCode as ApiErrorCode, message: record.lastErrorMessage }
          : null,
    };
  }

  private settings(): SpotifySettings {
    if (!this.options.settings) {
      throw new ApiError(
        'not_configured',
        'Spotify is not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_REDIRECT_URI (see docs/SPOTIFY.md).',
      );
    }
    return this.options.settings;
  }

  /** Step 1: a one-time `state` and PKCE challenge; the browser then goes to Spotify to approve access. */
  beginAuthorization(): { authorizeUrl: string } {
    const { clientId, redirectUri } = this.settings();
    this.prunePending();
    if (this.pending.size >= MAX_PENDING) {
      throw new ApiError(
        'too_many_requests',
        'Too many pending Spotify authorizations. Try again shortly.',
      );
    }

    const state = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(64));
    this.pending.set(state, { verifier, createdAt: this.clock() });

    const url = new URL('/authorize', this.endpoints.accountsUrl);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SPOTIFY_SCOPES.join(' '),
      redirect_uri: redirectUri,
      state,
      code_challenge_method: 'S256',
      code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    }).toString();
    return { authorizeUrl: url.toString() };
  }

  /**
   * Step 2: Spotify sends the browser back with `code` and `state`. The state is single-use and must be one
   * this server issued, which is what protects this (session-less) callback from forged requests.
   */
  async completeAuthorization(code: string, state: string): Promise<void> {
    this.prunePending();
    const pending = this.pending.get(state);
    this.pending.delete(state); // single use, whatever happens next
    if (!pending) throw new ApiError('invalid_credentials', 'Unknown or expired authorization.');

    const { clientId, redirectUri } = this.settings();
    const tokens = await this.requestTokens({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      code_verifier: pending.verifier,
    });
    if (!tokens.refreshToken) {
      throw new ApiError('invalid_response', 'Spotify did not return a refresh token.');
    }

    let profile: unknown;
    try {
      profile = await this.get('/me', tokens.accessToken);
    } catch (error) {
      if (error instanceof TokenRejected) {
        throw new ApiError('upstream_error', 'Spotify rejected the new token.');
      }
      throw error;
    }
    const me = asRecord(profile);
    const userId = asString(me.id);
    if (!userId) throw new ApiError('invalid_response', 'Spotify returned an unreadable account.');

    this.options.repo.save({
      accessTokenEnc: this.options.secrets.encrypt(tokens.accessToken),
      refreshTokenEnc: this.options.secrets.encrypt(tokens.refreshToken),
      expiresAt: new Date(tokens.expiresAt).toISOString(),
      scope: tokens.scope,
      userId,
      displayName: asString(me.display_name),
      product: asString(me.product),
      connectedAt: new Date(this.clock()).toISOString(),
      reauthRequired: false,
      lastErrorCode: null,
      lastErrorMessage: null,
    });
    this.options.logger.info({ product: asString(me.product) }, 'spotify connected');
  }

  /** Forgets the account and its tokens here. (The app can also be removed at spotify.com/account/apps.) */
  disconnect(): void {
    this.options.repo.clear();
    this.options.logger.info({}, 'spotify disconnected');
  }

  async playlists(): Promise<SpotifyPlaylistsResponse> {
    const body = asRecord(await this.authorized(`/me/playlists?limit=${PLAYLIST_PAGE}`));
    const items = Array.isArray(body.items) ? body.items : [];
    return {
      total: asNumber(body.total) ?? items.length,
      playlists: items.flatMap((raw) => {
        const item = asRecord(raw);
        const id = asString(item.id);
        const name = asString(item.name);
        if (!id || name === null) return [];
        const images = Array.isArray(item.images) ? item.images : [];
        return [
          {
            id,
            name,
            tracks: asNumber(asRecord(item.tracks).total),
            owner: asString(asRecord(item.owner).display_name),
            imageUrl: asString(asRecord(images[0]).url),
          },
        ];
      }),
    };
  }

  async devices(): Promise<SpotifyDevicesResponse> {
    const body = asRecord(await this.authorized('/me/player/devices'));
    const list = Array.isArray(body.devices) ? body.devices : [];
    return { devices: list.flatMap((raw) => toDevice(raw)) };
  }

  async playback(): Promise<SpotifyPlaybackResponse> {
    const body = await this.authorized('/me/player');
    if (body === null) return { playback: null }; // 204: nothing is playing
    const data = asRecord(body);
    const item = asRecord(data.item);
    const track = asString(item.name)
      ? {
          name: asString(item.name)!,
          artists: (Array.isArray(item.artists) ? item.artists : [])
            .map((artist) => asString(asRecord(artist).name))
            .filter((name): name is string => name !== null),
          album: asString(asRecord(item.album).name),
          durationMs: asNumber(item.duration_ms) ?? 0,
        }
      : null;
    const playback: SpotifyPlayback = {
      isPlaying: data.is_playing === true,
      device: toDevice(data.device)[0] ?? null,
      track,
      progressMs: asNumber(data.progress_ms),
    };
    return { playback };
  }

  // ---------------------------------------------------------------------------------------------------

  private prunePending(): void {
    const limit = this.clock() - PENDING_TTL_MS;
    for (const [state, entry] of this.pending)
      if (entry.createdAt < limit) this.pending.delete(state);
  }

  /** Calls the Web API as the connected user, refreshing the token when needed. `null` means 204. */
  private async authorized(path: string): Promise<unknown> {
    const record = this.options.repo.get();
    if (!record || record.reauthRequired || !record.refreshTokenEnc) {
      throw new ApiError(
        'spotify_connect_required',
        record?.reauthRequired
          ? 'Spotify access ended. Connect the account again.'
          : 'Spotify is not connected.',
      );
    }
    let token = await this.validAccessToken(record);
    try {
      return await this.get(path, token);
    } catch (error) {
      // The token can be revoked or expire between our check and Spotify's: refresh once and retry.
      if (error instanceof TokenRejected) {
        token = await this.refresh(true);
        try {
          return await this.get(path, token);
        } catch (second) {
          // A brand-new token was also refused: the authorization itself is no longer valid.
          if (second instanceof TokenRejected) {
            this.options.repo.markReauthRequired({
              code: 'spotify_connect_required',
              message: 'Spotify no longer accepts this account. Connect it again.',
            });
            throw new ApiError('spotify_connect_required', 'Connect the Spotify account again.');
          }
          throw second;
        }
      }
      throw error;
    }
  }

  /** A stored token that cannot be decrypted (key lost or changed) means: connect the account again. */
  private decryptOrReauth(stored: string): string {
    try {
      return this.options.secrets.decrypt(stored);
    } catch {
      this.options.repo.markReauthRequired({
        code: 'spotify_connect_required',
        message: 'The saved Spotify authorization could not be read. Connect the account again.',
      });
      throw new ApiError('spotify_connect_required', 'Connect the Spotify account again.');
    }
  }

  private async validAccessToken(record: SpotifyConnectionRecord): Promise<string> {
    const expiresAt = record.expiresAt ? Date.parse(record.expiresAt) : 0;
    if (record.accessTokenEnc && expiresAt - this.clock() > REFRESH_MARGIN_MS) {
      return this.decryptOrReauth(record.accessTokenEnc);
    }
    return this.refresh(false);
  }

  /** One refresh at a time, however many requests are waiting for it. */
  private refresh(force: boolean): Promise<string> {
    this.refreshing ??= this.doRefresh(force).finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }

  private async doRefresh(force: boolean): Promise<string> {
    const record = this.options.repo.get();
    if (!record?.refreshTokenEnc) {
      throw new ApiError('spotify_connect_required', 'Spotify is not connected.');
    }
    // Another caller may have refreshed while we waited for the lock.
    if (!force && record.accessTokenEnc && record.expiresAt) {
      if (Date.parse(record.expiresAt) - this.clock() > REFRESH_MARGIN_MS) {
        return this.decryptOrReauth(record.accessTokenEnc);
      }
    }

    const refreshToken = this.decryptOrReauth(record.refreshTokenEnc);

    try {
      const tokens = await this.requestTokens({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.settings().clientId,
      });
      this.options.repo.updateTokens({
        accessTokenEnc: this.options.secrets.encrypt(tokens.accessToken),
        // Spotify may or may not rotate the refresh token: keep the old one when it does not.
        refreshTokenEnc: this.options.secrets.encrypt(tokens.refreshToken ?? refreshToken),
        expiresAt: new Date(tokens.expiresAt).toISOString(),
        scope: tokens.scope || undefined,
      });
      return tokens.accessToken;
    } catch (error) {
      if (error instanceof ApiError && error.code === 'spotify_connect_required') {
        this.options.repo.markReauthRequired({ code: error.code, message: error.message });
      }
      throw error;
    }
  }

  /** POST to the token endpoint. Maps `invalid_grant` (revoked/expired) to "connect again". */
  private async requestTokens(form: Record<string, string>): Promise<{
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
    scope: string;
  }> {
    const response = await this.fetchJson(`${this.endpoints.accountsUrl}/api/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
    });

    if (response.status === 400 || response.status === 401) {
      const error = asString(asRecord(response.body).error);
      if (error === 'invalid_grant') {
        throw new ApiError(
          'spotify_connect_required',
          'Spotify no longer accepts the saved authorization. Connect the account again.',
        );
      }
      throw new ApiError('upstream_error', 'Spotify rejected the authorization request.');
    }
    if (response.status === 429) throw this.rateLimited(response.retryAfter);
    if (response.status >= 500)
      throw new ApiError('upstream_error', 'Spotify is having problems. Try again later.');
    if (response.status !== 200)
      throw new ApiError('upstream_error', 'Unexpected answer from Spotify.');

    const body = response.body as TokenResponse;
    const accessToken = asString(body.access_token);
    const expiresIn = asNumber(body.expires_in);
    if (!accessToken || expiresIn === null) {
      throw new ApiError('invalid_response', 'Spotify returned an unreadable token response.');
    }
    return {
      accessToken,
      refreshToken: asString(body.refresh_token),
      expiresAt: this.clock() + expiresIn * 1000,
      scope: asString(body.scope) ?? '',
    };
  }

  /** GET on the Web API with a bearer token. Returns the JSON body, or `null` for 204. */
  private async get(path: string, accessToken: string): Promise<unknown> {
    const response = await this.fetchJson(`${this.endpoints.apiUrl}${path}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    switch (true) {
      case response.status === 204:
        return null;
      case response.status === 200:
        return response.body;
      case response.status === 401:
        // Signalled to `authorized`, which refreshes once and retries.
        throw new TokenRejected();
      case response.status === 403:
        throw new ApiError(
          'spotify_forbidden',
          'Spotify refused access. The account may not be allowed to use this app (apps in development mode only accept users added in the Spotify dashboard), or a permission is missing.',
        );
      case response.status === 429:
        throw this.rateLimited(response.retryAfter);
      case response.status >= 500:
        throw new ApiError('upstream_error', 'Spotify is having problems. Try again later.');
      default:
        throw new ApiError('upstream_error', 'Unexpected answer from Spotify.');
    }
  }

  private rateLimited(retryAfter: number | null): ApiError {
    return new ApiError(
      'too_many_requests',
      `Spotify is limiting requests.${retryAfter ? ` Try again in ${retryAfter} seconds.` : ''}`,
    );
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<{ status: number; body: unknown; retryAfter: number | null }> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        redirect: 'manual',
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch (error) {
      // Never include the URL or headers: they can carry tokens.
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new ApiError(
        timedOut ? 'timeout' : 'unreachable',
        timedOut ? 'Spotify took too long to answer.' : 'Could not reach Spotify.',
      );
    }
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null; // an unreadable body is treated as empty
    }
    const retry = Number(response.headers.get('retry-after'));
    return {
      status: response.status,
      body,
      retryAfter: Number.isFinite(retry) && retry > 0 ? retry : null,
    };
  }
}

function toDevice(raw: unknown): SpotifyDevice[] {
  const device = asRecord(raw);
  const name = asString(device.name);
  if (name === null) return [];
  return [
    {
      id: asString(device.id),
      name,
      type: asString(device.type) ?? 'Unknown',
      isActive: device.is_active === true,
      isRestricted: device.is_restricted === true,
      volumePercent: asNumber(device.volume_percent),
    },
  ];
}
