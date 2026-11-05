import { createHash, randomBytes } from 'node:crypto';
import type {
  SpotifyDevice,
  SpotifyDevicesResponse,
  SpotifyPlayback,
  SpotifyPlaybackResponse,
  SpotifyPlaylistsResponse,
  SpotifyStatus,
} from '@home-control/shared';
import {
  SPOTIFY_CLIENT_ID_PATTERN,
  SPOTIFY_CONTROL_SCOPE,
  SPOTIFY_LIBRARY_SCOPES,
  SPOTIFY_SEARCH_PAGE_MAX,
  SPOTIFY_TRACKS_PAGE_MAX,
  spotifyRedirectUriProblem,
  type ApiErrorCode,
  type SpotifyConfigInput,
  type SpotifyConfigResponse,
  type SpotifyConfigView,
  type SpotifyControlCommand,
  type SpotifyControlResult,
  type SpotifyControlState,
  type SpotifySavedResponse,
  type SpotifyTrack,
  type SpotifyTrackPage,
  type SpotifyTestCheck,
  type SpotifyTestResult,
} from '@home-control/shared';
import { ApiError } from '../errors.js';
import type { Logger } from '../homeassistant/types.js';
import type {
  SpotifyConfigRepository,
  SpotifyConnectionRecord,
  SpotifyRepository,
} from '../storage/index.js';
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
 * Account, playback state and playlists (read), plus `user-modify-playback-state` so the Music player can
 * control playback. Connections made before that permission existed must connect again to use it.
 */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-playback-state',
  'playlist-read-private',
  'playlist-read-collaborative',
  // Needed to play, pause, skip, transfer and start playlists through the Web API.
  SPOTIFY_CONTROL_SCOPE,
  // Personal library: browse saved tracks and save/remove tracks.
  ...SPOTIFY_LIBRARY_SCOPES,
] as const;

export interface SpotifyServiceOptions {
  /** From the server's environment. A configuration saved in the app takes precedence. */
  settings: SpotifySettings | null;
  configRepo: SpotifyConfigRepository;
  repo: SpotifyRepository;
  secrets: SecretBox;
  logger: Logger;
  endpoints?: SpotifyEndpoints;
  clock?: () => number;
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Delay before reading the state back after a command (tests use a short one). */
  confirmDelayMs?: number;
}

interface PendingAuthorization {
  verifier: string;
  /** The registration this flow started with, so editing the settings mid-flow cannot break it. */
  clientId: string;
  redirectUri: string;
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
const CONTROL_CACHE_MS = 2000;
const CONTROL_CONFIRM_ATTEMPTS = 3;
const EMPTY_STATE: SpotifyControlState = {
  canControl: false,
  premium: null,
  playback: null,
  devices: [],
  observedAt: new Date(0).toISOString(),
};

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

  /** The registration in use: saved in the app (preferred) or from the environment. */
  private effective(): { source: 'saved' | 'environment'; settings: SpotifySettings } | null {
    const saved = this.options.configRepo.get();
    if (saved) {
      return {
        source: 'saved',
        settings: { clientId: saved.clientId, redirectUri: saved.redirectUri },
      };
    }
    return this.options.settings
      ? { source: 'environment', settings: this.options.settings }
      : null;
  }

  get configured(): boolean {
    return this.effective() !== null;
  }

  private configView(): SpotifyConfigView {
    const active = this.effective();
    return {
      source: active?.source ?? null,
      clientId: active?.settings.clientId ?? null,
      redirectUri: active?.settings.redirectUri ?? null,
      environmentAvailable: this.options.settings !== null,
    };
  }

  /** Validates and saves the app registration. A different Client ID invalidates the saved account. */
  saveConfig(input: SpotifyConfigInput): SpotifyConfigResponse {
    const clientId = input.clientId.trim();
    const redirectUri = input.redirectUri.trim();
    if (!SPOTIFY_CLIENT_ID_PATTERN.test(clientId)) {
      throw new ApiError(
        'invalid_params',
        'clientId: the Client ID has 32 hexadecimal characters (copy it from the Spotify Developer Dashboard).',
      );
    }
    const problem = spotifyRedirectUriProblem(redirectUri);
    if (problem) throw new ApiError('invalid_params', `redirectUri: ${problem}`);
    const before = this.effective()?.settings.clientId ?? null;
    this.options.configRepo.save({ clientId, redirectUri });
    return this.afterConfigChange(before);
  }

  /** Removes the saved registration; the environment one (if any) becomes active again. */
  clearConfig(): SpotifyConfigResponse {
    const before = this.effective()?.settings.clientId ?? null;
    this.options.configRepo.clear();
    return this.afterConfigChange(before);
  }

  private afterConfigChange(previousClientId: string | null): SpotifyConfigResponse {
    this.pending.clear();
    const now = this.effective()?.settings.clientId ?? null;
    let connectionReset = false;
    // Tokens belong to one Spotify app: with another Client ID they would never refresh.
    if (previousClientId !== now && this.options.repo.get()) {
      this.options.repo.clear();
      connectionReset = true;
    }
    this.options.logger.info(
      { source: this.effective()?.source ?? null },
      'spotify config changed',
    );
    return { status: this.status(), connectionReset };
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
      config: this.configView(),
    };
  }

  private settings(): SpotifySettings {
    const active = this.effective();
    if (!active) {
      throw new ApiError(
        'not_configured',
        'Spotify is not configured. Save the Client ID and callback in Settings > Spotify (see docs/SPOTIFY.md).',
      );
    }
    return active.settings;
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
    this.pending.set(state, { verifier, clientId, redirectUri, createdAt: this.clock() });

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

    const { clientId, redirectUri } = pending;
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
      profile = await this.call('/me', tokens.accessToken);
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

  /**
   * Read-only end-to-end check of the direct connection: configuration, saved authorization, account access,
   * granted permissions, Premium and device visibility. It never changes playback and never returns tokens.
   */
  async test(): Promise<SpotifyTestResult> {
    const checks: SpotifyTestCheck[] = [];
    const add = (check: SpotifyTestCheck) => checks.push(check);
    const skipped = (id: SpotifyTestCheck['id'], label: string, why: string) =>
      add({ id, label, status: 'skipped', message: why });
    const finish = (): SpotifyTestResult => ({
      ok:
        checks.every(
          (c) => c.status === 'ok' || c.status === 'warning' || c.status === 'skipped',
        ) && checks.some((c) => c.status === 'ok'),
      checks,
      testedAt: new Date(this.clock()).toISOString(),
    });

    const active = this.effective();
    if (!active) {
      add({
        id: 'config',
        label: 'Configuração',
        status: 'failed',
        message: 'Salve o Client ID e o callback do seu app do Spotify nesta tela.',
      });
    } else {
      const problem = spotifyRedirectUriProblem(active.settings.redirectUri);
      add({
        id: 'config',
        label: 'Configuração',
        status: problem ? 'failed' : 'ok',
        message: problem ?? 'Client ID e callback salvos e válidos.',
      });
    }

    const record = this.options.repo.get();
    if (!active) {
      skipped('connection', 'Conexão', 'Configure o app primeiro.');
    } else if (!record) {
      add({
        id: 'connection',
        label: 'Conexão',
        status: 'failed',
        message: 'A conta ainda não foi conectada. Use "Conectar Spotify".',
      });
    } else if (record.reauthRequired || !record.refreshTokenEnc) {
      add({
        id: 'connection',
        label: 'Conexão',
        status: 'failed',
        message: 'O acesso terminou (revogado ou expirado). Use "Conectar de novo".',
      });
    } else {
      add({ id: 'connection', label: 'Conexão', status: 'ok', message: 'Autorização salva.' });
    }
    if (checks.find((c) => c.id === 'connection')?.status !== 'ok') {
      for (const [id, label] of [
        ['account', 'Conta'],
        ['scopes', 'Permissões'],
        ['premium', 'Premium'],
        ['devices', 'Dispositivos'],
      ] as const) {
        skipped(id, label, 'Depende da conexão.');
      }
      return finish();
    }

    // Account: also proves the token works (refreshing it when needed).
    let me: Record<string, unknown> | null = null;
    try {
      me = asRecord(await this.authorized('/me'));
      add({
        id: 'account',
        label: 'Conta',
        status: 'ok',
        message: `Acesso confirmado${asString(me.display_name) ? ` para ${asString(me.display_name)}` : ''}.`,
      });
    } catch (error) {
      add({
        id: 'account',
        label: 'Conta',
        status: 'failed',
        message: this.describeTestError(error),
      });
    }

    const granted = new Set((this.options.repo.get()?.scope ?? '').split(' ').filter(Boolean));
    const missing = SPOTIFY_SCOPES.filter((scope) => !granted.has(scope));
    add({
      id: 'scopes',
      label: 'Permissões',
      status: missing.length === 0 ? 'ok' : 'failed',
      message:
        missing.length === 0
          ? 'Todas as permissões (leitura e controle) foram concedidas.'
          : `Faltam permissões (${missing.join(', ')}). Use "Conectar de novo" e aceite todas.`,
    });

    if (me) {
      const product = asString(me.product);
      add({
        id: 'premium',
        label: 'Premium',
        status: product === 'premium' ? 'ok' : 'warning',
        message:
          product === 'premium'
            ? 'Conta Premium: o Spotify permite controlar a reprodução.'
            : `Conta ${product ?? 'sem plano informado'}: ver dispositivos e playlists funciona, mas o Spotify só permite controlar a reprodução com Premium.`,
      });
    } else {
      skipped('premium', 'Premium', 'Depende da conta.');
    }

    try {
      const body = asRecord(await this.authorized('/me/player/devices'));
      const count = Array.isArray(body.devices) ? body.devices.length : 0;
      add({
        id: 'devices',
        label: 'Dispositivos',
        status: 'ok',
        message:
          count > 0
            ? `${count} dispositivo(s) disponível(is) agora.`
            : 'Acesso ok, mas nenhum dispositivo está disponível agora. Abra o Spotify em um aparelho.',
      });
    } catch (error) {
      add({
        id: 'devices',
        label: 'Dispositivos',
        status: 'failed',
        message: this.describeTestError(error),
      });
    }
    return finish();
  }

  /** Actionable pt-BR text for a failed read-only check; never includes Spotify's raw response. */
  private describeTestError(error: unknown): string {
    if (error instanceof ApiError) {
      switch (error.code) {
        case 'spotify_connect_required':
          return 'O Spotify não aceita mais esta autorização. Use "Conectar de novo".';
        case 'spotify_forbidden':
          return 'O Spotify recusou o acesso. Com o app em modo de desenvolvimento, adicione esta conta em User Management no Dashboard do Spotify.';
        case 'too_many_requests':
          return 'O Spotify está limitando as requisições deste app. Tente de novo em instantes.';
        case 'timeout':
        case 'unreachable':
          return 'Não foi possível falar com o Spotify. Verifique a internet do servidor.';
        default:
          return 'O Spotify respondeu algo inesperado. Tente de novo mais tarde.';
      }
    }
    return 'Falha inesperada ao falar com o Spotify.';
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
            // Spotify renamed the playlist `tracks` object to `items` (February 2026).
            tracks: asNumber(asRecord(item.items).total) ?? asNumber(asRecord(item.tracks).total),
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
    return { playback: toPlayback(await this.authorized('/me/player')) };
  }

  // --- Personal library: search, saved tracks, playlist tracks, save/remove -----------------------------

  private requireLibraryScopes(): void {
    const granted = new Set((this.options.repo.get()?.scope ?? '').split(' '));
    if (!SPOTIFY_LIBRARY_SCOPES.every((scope) => granted.has(scope))) {
      throw new ApiError(
        'spotify_scope_missing',
        'The saved authorization cannot read or change your library. Connect Spotify again and accept all permissions.',
      );
    }
  }

  /** Track search. Spotify caps a page at 10 results, so the page size is clamped to that. */
  async searchTracks(
    query: string,
    offset = 0,
    limit = SPOTIFY_SEARCH_PAGE_MAX,
  ): Promise<SpotifyTrackPage> {
    this.requireLibraryScopes();
    const size = Math.min(Math.max(limit, 1), SPOTIFY_SEARCH_PAGE_MAX);
    const params = new URLSearchParams({
      q: query,
      type: 'track',
      limit: String(size),
      offset: String(offset),
    });
    const body = asRecord(asRecord(await this.authorized(`/search?${params}`)).tracks);
    return this.trackPage(body, offset, size, (item) => item, false);
  }

  /** The user's saved ("liked") tracks, newest first. */
  async savedTracks(offset = 0, limit = 20): Promise<SpotifyTrackPage> {
    this.requireLibraryScopes();
    const size = Math.min(Math.max(limit, 1), SPOTIFY_TRACKS_PAGE_MAX);
    const body = asRecord(await this.authorized(`/me/tracks?limit=${size}&offset=${offset}`));
    // Everything in this list is saved by definition; no extra request is needed.
    return this.trackPage(body, offset, size, (item) => asRecord(item).track, true);
  }

  /**
   * Tracks of a playlist. Since February 2026 Spotify only returns the items of playlists the user owns or
   * collaborates on; for any other playlist the request is refused and the limitation is explained.
   */
  async playlistTracks(playlistId: string, offset = 0, limit = 20): Promise<SpotifyTrackPage> {
    this.requireLibraryScopes();
    const size = Math.min(Math.max(limit, 1), SPOTIFY_TRACKS_PAGE_MAX);
    let body: Record<string, unknown>;
    try {
      body = asRecord(
        await this.authorized(
          `/playlists/${encodeURIComponent(playlistId)}/items?limit=${size}&offset=${offset}&additional_types=track`,
        ),
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === 'spotify_forbidden') {
        throw new ApiError(
          'spotify_content_unavailable',
          'Spotify only shares the tracks of playlists you created or collaborate on.',
        );
      }
      throw error;
    }
    // `item` is the current field; `track` is the deprecated one.
    return this.trackPage(
      body,
      offset,
      size,
      (entry) => {
        const e = asRecord(entry);
        return e.item ?? e.track;
      },
      false,
    );
  }

  private async trackPage(
    body: Record<string, unknown>,
    offset: number,
    size: number,
    pick: (item: unknown) => unknown,
    allSaved: boolean,
  ): Promise<SpotifyTrackPage> {
    const items = Array.isArray(body.items) ? body.items : [];
    const tracks = items.flatMap((raw) => toTrack(pick(raw)));
    const savedIds = allSaved
      ? new Set(tracks.map((t) => t.id))
      : await this.savedIds(tracks.map((t) => t.id));
    const total = asNumber(body.total) ?? offset + items.length;
    const next = offset + items.length;
    return {
      tracks: tracks.map((track) => ({ ...track, saved: savedIds.has(track.id) })),
      total,
      offset,
      nextOffset: items.length > 0 && next < total ? next : null,
    };
  }

  /** Which of these tracks are in the library, according to Spotify (40 per request, its documented limit). */
  private async savedIds(ids: string[]): Promise<Set<string>> {
    const saved = new Set<string>();
    for (let i = 0; i < ids.length; i += 40) {
      const chunk = ids.slice(i, i + 40);
      const uris = chunk.map((id) => `spotify:track:${id}`).join(',');
      const result = await this.authorized(`/me/library/contains?uris=${encodeURIComponent(uris)}`);
      if (Array.isArray(result))
        result.forEach((flag, index) => flag === true && saved.add(chunk[index]!));
    }
    return saved;
  }

  /** Saves or removes one track, then asks Spotify again so the answer is what it actually reports. */
  async setTrackSaved(trackId: string, save: boolean): Promise<SpotifySavedResponse> {
    this.requireLibraryScopes();
    const uri = `spotify:track:${trackId}`;
    await this.authorized(`/me/library?uris=${encodeURIComponent(uri)}`, {
      method: save ? 'PUT' : 'DELETE',
    });
    const saved = (await this.savedIds([trackId])).has(trackId);
    return { trackId, saved };
  }

  // --- Playback control through the Web API -----------------------------------------------------------
  private controlCache: { at: number; value: SpotifyControlState } | null = null;
  private controlInFlight: Promise<SpotifyControlState> | null = null;
  private controlBusy = false;
  /** No request leaves this server while Spotify asked us to wait (HTTP 429 + Retry-After). */
  private limitedUntil = 0;

  private get canControl(): boolean {
    return (this.options.repo.get()?.scope ?? '').split(' ').includes(SPOTIFY_CONTROL_SCOPE);
  }

  /** Playback and outputs, from at most one pair of Web API requests per 2 seconds. */
  controlState(): Promise<SpotifyControlState> {
    if (this.controlCache && this.clock() - this.controlCache.at < CONTROL_CACHE_MS) {
      return Promise.resolve(this.controlCache.value);
    }
    this.controlInFlight ??= this.readControlState().finally(() => {
      this.controlInFlight = null;
    });
    return this.controlInFlight;
  }

  private async readControlState(): Promise<SpotifyControlState> {
    const [player, devices] = await Promise.all([
      this.authorized('/me/player'),
      this.authorized('/me/player/devices'),
    ]);
    const list = asRecord(devices).devices;
    const product = this.options.repo.get()?.product ?? null;
    const value: SpotifyControlState = {
      canControl: this.canControl,
      premium: product === null ? null : product === 'premium',
      playback: toPlayback(player),
      devices: (Array.isArray(list) ? list : []).flatMap((raw) => toDevice(raw)),
      observedAt: new Date(this.clock()).toISOString(),
    };
    this.controlCache = { at: this.clock(), value };
    return value;
  }

  /** play / pause / next / previous on the active output (or an explicit available one). */
  async control(command: SpotifyControlCommand, deviceId?: string): Promise<SpotifyControlResult> {
    const before = await this.prepareControl(deviceId);
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const request: Record<SpotifyControlCommand, [string, string]> = {
      play: ['PUT', `/me/player/play${query}`],
      pause: ['PUT', `/me/player/pause${query}`],
      next: ['POST', `/me/player/next${query}`],
      previous: ['POST', `/me/player/previous${query}`],
    };
    const [method, path] = request[command];
    const trackOf = (state: SpotifyControlState) => state.playback?.trackId ?? null;
    return this.runControl(method, path, undefined, (state) =>
      command === 'play'
        ? state.playback?.isPlaying === true
        : command === 'pause'
          ? state.playback?.isPlaying === false
          : trackOf(state) !== trackOf(before),
    );
  }

  /** Moves playback to another available output. `play` keeps or starts playing there. */
  async transfer(deviceId: string, play: boolean): Promise<SpotifyControlResult> {
    await this.prepareControl(deviceId);
    return this.runControl('PUT', '/me/player', { device_ids: [deviceId], play }, (state) =>
      state.devices.some((d) => d.id === deviceId && d.isActive),
    );
  }

  /** Starts a playlist on the active output, or on an explicitly chosen available one. */
  async playPlaylist(playlistId: string, deviceId?: string): Promise<SpotifyControlResult> {
    const before = await this.prepareControl(deviceId);
    if (!deviceId && !before.devices.some((d) => d.isActive)) {
      throw new ApiError(
        'spotify_no_device',
        'No active Spotify output. Pick an available device first.',
      );
    }
    const uri = `spotify:playlist:${playlistId}`;
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    return this.runControl(
      'PUT',
      `/me/player/play${query}`,
      { context_uri: uri },
      (state) => state.playback?.contextUri === uri && state.playback.isPlaying,
    );
  }

  /** Plays one track on the active (or chosen) output, optionally inside a playlist context. */
  async playTrack(
    trackId: string,
    contextUri?: string,
    deviceId?: string,
  ): Promise<SpotifyControlResult> {
    const before = await this.prepareControl(deviceId);
    if (!deviceId && !before.devices.some((d) => d.isActive)) {
      throw new ApiError(
        'spotify_no_device',
        'No active Spotify output. Pick an available device first.',
      );
    }
    const uri = `spotify:track:${trackId}`;
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const body = contextUri ? { context_uri: contextUri, offset: { uri } } : { uris: [uri] };
    return this.runControl(
      'PUT',
      `/me/player/play${query}`,
      body,
      (state) => state.playback?.trackId === trackId && state.playback.isPlaying,
    );
  }

  /** Checks permission, Premium and the target output before anything is sent to Spotify. */
  private async prepareControl(deviceId?: string): Promise<SpotifyControlState> {
    if (!this.canControl) {
      throw new ApiError(
        'spotify_scope_missing',
        'The saved authorization cannot control playback. Connect Spotify again and accept all permissions.',
      );
    }
    const state = await this.controlState();
    if (state.premium === false) {
      throw new ApiError(
        'spotify_premium_required',
        'Controlling playback needs a Premium account.',
      );
    }
    if (deviceId) {
      const device = state.devices.find((d) => d.id === deviceId);
      if (!device) {
        throw new ApiError(
          'spotify_no_device',
          'That output is not available on Spotify right now. Open Spotify on it and refresh.',
        );
      }
      if (device.isRestricted) {
        throw new ApiError('spotify_restricted', 'Spotify does not allow controlling that output.');
      }
    }
    return state;
  }

  /**
   * Sends one command and reports it honestly: HTTP 2xx only means Spotify accepted it, so the state is read
   * again (a few times, spaced) and the result is `confirmed` only if the change was observed.
   */
  private async runControl(
    method: string,
    path: string,
    body: unknown,
    observed: (state: SpotifyControlState) => boolean,
  ): Promise<SpotifyControlResult> {
    if (this.controlBusy) {
      throw new ApiError('conflict', 'Another Spotify command is still running.');
    }
    this.controlBusy = true;
    try {
      await this.authorized(path, { method, body, command: true });
      let state: SpotifyControlState | null = null;
      for (let attempt = 0; attempt < CONTROL_CONFIRM_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, this.options.confirmDelayMs ?? 700));
        this.controlCache = null;
        try {
          state = await this.readControlState();
        } catch {
          break; // reading back failed (for example rate limited): report what we know
        }
        if (observed(state)) return { status: 'confirmed', state };
      }
      this.controlCache = null;
      return {
        status: 'accepted',
        state: state ?? (await this.controlState().catch(() => EMPTY_STATE)),
      };
    } finally {
      this.controlBusy = false;
    }
  }

  // ---------------------------------------------------------------------------------------------------

  private prunePending(): void {
    const limit = this.clock() - PENDING_TTL_MS;
    for (const [state, entry] of this.pending)
      if (entry.createdAt < limit) this.pending.delete(state);
  }

  /** Calls the Web API as the connected user, refreshing the token when needed. `null` means 204. */
  private async authorized(path: string, init: CallInit = {}): Promise<unknown> {
    this.assertNotLimited();
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
      return await this.call(path, token, init);
    } catch (error) {
      // The token can be revoked or expire between our check and Spotify's: refresh once and retry.
      if (error instanceof TokenRejected) {
        token = await this.refresh(true);
        try {
          return await this.call(path, token, init);
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
  private async call(path: string, accessToken: string, init: CallInit = {}): Promise<unknown> {
    const response = await this.fetchJson(`${this.endpoints.apiUrl}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    if (response.status === 204 || response.status === 202) return null;
    if (response.status === 200) return response.body;
    if (response.status === 401) {
      // Signalled to `authorized`, which refreshes once and retries.
      throw new TokenRejected();
    }
    if (response.status === 429) throw this.rateLimited(response.retryAfter);
    if (response.status >= 500) {
      throw new ApiError('upstream_error', 'Spotify is having problems. Try again later.');
    }
    const reason = asString(asRecord(asRecord(response.body).error).reason);
    if (init.command) {
      if (response.status === 404 || reason === 'NO_ACTIVE_DEVICE') {
        throw new ApiError(
          'spotify_no_device',
          'No active Spotify output. Open Spotify on a device or pick one from the list.',
        );
      }
      if (response.status === 403) {
        throw reason === 'PREMIUM_REQUIRED'
          ? new ApiError(
              'spotify_premium_required',
              'Controlling playback needs a Premium account.',
            )
          : new ApiError(
              'spotify_restricted',
              'Spotify refused the command for this output (it may be restricted or the action is not allowed right now).',
            );
      }
    }
    if (response.status === 403) {
      throw new ApiError(
        'spotify_forbidden',
        'Spotify refused access. The account may not be allowed to use this app (apps in development mode only accept users added in the Spotify dashboard), or a permission is missing.',
      );
    }
    throw new ApiError('upstream_error', 'Unexpected answer from Spotify.');
  }

  private assertNotLimited(): void {
    const remaining = Math.ceil((this.limitedUntil - this.clock()) / 1000);
    if (remaining > 0) throw this.rateLimited(remaining, false);
  }

  private rateLimited(retryAfter: number | null, record = true): ApiError {
    const seconds = retryAfter ?? 5;
    if (record) this.limitedUntil = Math.max(this.limitedUntil, this.clock() + seconds * 1000);
    return new ApiError(
      'too_many_requests',
      `Spotify is limiting requests. Try again in ${seconds} seconds.`,
      {
        retryAfter: seconds,
      },
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

interface CallInit {
  method?: string;
  body?: unknown;
  /** A playback command: Spotify's 403/404 reasons are mapped to actionable errors. */
  command?: boolean;
}

/** `null` (HTTP 204) means nothing is playing on any device. */
function toPlayback(body: unknown): SpotifyPlayback | null {
  if (body === null) return null;
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
  const disallows = asRecord(asRecord(data.actions).disallows);
  return {
    isPlaying: data.is_playing === true,
    contextUri: asString(asRecord(data.context).uri),
    disallowed: Object.keys(disallows).filter((key) => disallows[key] === true),
    trackId: asString(item.id),
    device: toDevice(data.device)[0] ?? null,
    track,
    progressMs: asNumber(data.progress_ms),
  };
}

/** A playable-looking track; episodes, `null` entries (removed items) and malformed rows are skipped. */
function toTrack(raw: unknown): Array<Omit<SpotifyTrack, 'saved'>> {
  const t = asRecord(raw);
  const id = asString(t.id);
  const name = asString(t.name);
  if (!id || name === null || (asString(t.type) ?? 'track') !== 'track') return [];
  const images = Array.isArray(asRecord(t.album).images)
    ? (asRecord(t.album).images as unknown[])
    : [];
  return [
    {
      id,
      uri: `spotify:track:${id}`,
      name,
      artists: (Array.isArray(t.artists) ? t.artists : [])
        .map((artist) => asString(asRecord(artist).name))
        .filter((n): n is string => n !== null),
      album: asString(asRecord(t.album).name),
      durationMs: asNumber(t.duration_ms) ?? 0,
      imageUrl: asString(asRecord(images[images.length - 1]).url),
      playable: t.is_playable !== false && t.is_local !== true,
    },
  ];
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
