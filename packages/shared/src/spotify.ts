/**
 * Spotify integration contracts. Tokens never appear here: they live only on the API server.
 * The direct connection is read-only; playback control goes through Home Assistant.
 */
import type { ApiErrorPayload } from './errors.js';

export const API_SPOTIFY_PATH = '/spotify';

/** `GET /spotify/status` */
export interface SpotifyStatus {
  /** The API has a Spotify app (client id and redirect URI). Without it nothing else can work. */
  configured: boolean;
  connected: boolean;
  /** The saved authorization stopped working (revoked or expired): the user must connect again. */
  reauthRequired: boolean;
  account: SpotifyAccount | null;
  /** Permissions the user granted. */
  scopes: string[];
  connectedAt: string | null;
  lastError: ApiErrorPayload | null;
  /** The app registration in use (the Client ID is public: this is a PKCE client with no secret). */
  config: SpotifyConfigView;
}

/** Path of the page Spotify sends the browser back to; the full URL to register is `<origin>` + this. */
export const SPOTIFY_CALLBACK_PATH = '/api/spotify/callback';

export type SpotifyConfigSource = 'saved' | 'environment';

export interface SpotifyConfigView {
  /** Where the active configuration comes from: saved in the app, or the server's environment. */
  source: SpotifyConfigSource | null;
  clientId: string | null;
  redirectUri: string | null;
  /** A configuration saved in the app overrides the environment; true when removing it falls back to one. */
  environmentAvailable: boolean;
}

/** `PUT /spotify/config` */
export interface SpotifyConfigInput {
  clientId: string;
  redirectUri: string;
}

/** `PUT`/`DELETE /spotify/config`: `connectionReset` is true when the saved account had to be forgotten. */
export interface SpotifyConfigResponse {
  status: SpotifyStatus;
  connectionReset: boolean;
}

/** Spotify Client IDs are 32 hexadecimal characters. */
export const SPOTIFY_CLIENT_ID_PATTERN = /^[0-9a-f]{32}$/i;

/**
 * Spotify only accepts `https` redirect URIs, or `http` on the loopback IP (not `localhost`). Returns a
 * pt-BR explanation of the problem, or `null` when the value is acceptable.
 */
export function spotifyRedirectUriProblem(value: string): string | null {
  const match = /^(https?):\/\/([^/?#\s]+)(\/[^?#\s]*)?(\?[^#\s]*)?(#\S*)?$/i.exec(value.trim());
  if (!match) return 'Informe uma URL completa, como https://seu-dominio/api/spotify/callback.';
  const [, scheme, authority, path = '', query, hash] = match;
  const host = authority!.replace(/:\d{1,5}$/, '').toLowerCase();
  const loopback = scheme!.toLowerCase() === 'http' && (host === '127.0.0.1' || host === '[::1]');
  if (scheme!.toLowerCase() !== 'https' && !loopback) {
    return 'O Spotify só aceita https, ou http no IP de loopback 127.0.0.1 (não aceita "localhost" nem endereços da rede local em http).';
  }
  if (path !== SPOTIFY_CALLBACK_PATH || query || hash) {
    return `O caminho deve ser exatamente ${SPOTIFY_CALLBACK_PATH}, sem parâmetros.`;
  }
  return null;
}

/** `POST /spotify/test`: read-only checks of the whole direct connection. */
export interface SpotifyTestCheck {
  id: 'config' | 'connection' | 'account' | 'scopes' | 'premium' | 'devices';
  label: string;
  /** `warning` does not fail the test but needs attention (for example no Premium). */
  status: 'ok' | 'warning' | 'failed' | 'skipped';
  /** What happened and, when it is not ok, what to do. */
  message: string;
}

export interface SpotifyTestResult {
  ok: boolean;
  checks: SpotifyTestCheck[];
  testedAt: string;
}

export interface SpotifyAccount {
  id: string;
  displayName: string | null;
  /** `premium`, `free`, `open`... as reported by Spotify. Controlling playback needs `premium`. */
  product: string | null;
}

/** `POST /spotify/connect`: the browser must navigate to `authorizeUrl` to approve access on Spotify. */
export interface SpotifyConnectResponse {
  authorizeUrl: string;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  /** Number of tracks, when Spotify reports it. */
  tracks: number | null;
  owner: string | null;
  imageUrl: string | null;
}

export interface SpotifyPlaylistsResponse {
  playlists: SpotifyPlaylist[];
  /** Total in the account. Only the first page is returned (see `playlists.length`). */
  total: number;
}

export interface SpotifyDevice {
  id: string | null;
  name: string;
  /** `Computer`, `Smartphone`, `Speaker`, `TV`... as reported by Spotify. */
  type: string;
  isActive: boolean;
  /** Spotify will not accept playback commands for a restricted device. */
  isRestricted: boolean;
  volumePercent: number | null;
}

export interface SpotifyDevicesResponse {
  devices: SpotifyDevice[];
}

export interface SpotifyPlayback {
  isPlaying: boolean;
  /** `spotify:playlist:...` (or album/artist) being played, when Spotify reports a context. */
  contextUri: string | null;
  /** Spotify's id of the current track; lets the API notice that a skip happened. */
  trackId: string | null;
  /** Actions Spotify says are not allowed right now (`pausing`, `resuming`, `skipping_next`...). */
  disallowed: string[];
  device: SpotifyDevice | null;
  track: { name: string; artists: string[]; album: string | null; durationMs: number } | null;
  progressMs: number | null;
}

/** `playback` is `null` when nothing is playing on any device. */
export interface SpotifyPlaybackResponse {
  playback: SpotifyPlayback | null;
}

/**
 * Playback control through the official Home Assistant Spotify integration
 * (Home Control -> API -> Home Assistant -> Spotify). Capabilities mirror what Home Assistant reports for
 * the entity right now: Home Assistant only offers play/pause/next/previous/play_media while Spotify has
 * an active session, so an idle player can only be pointed at an output (`selectSource`).
 */
export const API_SPOTIFY_PLAYER_PATH = `${API_SPOTIFY_PATH}/player`;

export type SpotifyPlayerCommand = 'play' | 'pause' | 'next' | 'previous';

export interface SpotifyPlayerCapabilities {
  play: boolean;
  pause: boolean;
  next: boolean;
  previous: boolean;
  /** Choose one of `sources` as the Spotify Connect output. */
  selectSource: boolean;
  /** Start a playlist. Without it a playlist cannot be started right now. */
  playPlaylist: boolean;
}

/** `GET /spotify/player` */
export interface SpotifyPlayerState {
  /** A Spotify media player exists in Home Assistant. */
  configured: boolean;
  entityId: string | null;
  /** Home Assistant state: `playing`, `paused`, `idle`, `off`, `unavailable`... */
  state: string | null;
  /** Spotify Connect outputs Home Assistant currently lists as available. */
  sources: string[];
  activeSource: string | null;
  track: { title: string | null; artist: string | null; album: string | null } | null;
  capabilities: SpotifyPlayerCapabilities;
}

/** `accepted`: Home Assistant took the command but the expected state was not seen in time. */
export interface SpotifyPlayerResult {
  status: 'confirmed' | 'accepted';
  player: SpotifyPlayerState;
}

/** Permission needed to control playback through the Web API (added to the read-only ones). */
export const SPOTIFY_CONTROL_SCOPE = 'user-modify-playback-state';

export const API_SPOTIFY_CONTROL_PATH = `${API_SPOTIFY_PATH}/control`;

export type SpotifyControlCommand = 'play' | 'pause' | 'next' | 'previous';

/** `GET /spotify/control/state`: what Spotify reports right now (one bounded read, cached for a moment). */
export interface SpotifyControlState {
  /** The saved authorization includes the playback-control permission. */
  canControl: boolean;
  /** The account is Premium (`null` when unknown). Spotify only accepts commands from Premium accounts. */
  premium: boolean | null;
  playback: SpotifyPlayback | null;
  devices: SpotifyDevice[];
  /** When the state was read from Spotify (ISO). */
  observedAt: string;
}

/**
 * `confirmed`: the state observed afterwards shows the change. `accepted`: Spotify accepted the command
 * (HTTP 2xx) but the change was not observed in time; it can still arrive.
 */
export interface SpotifyControlResult {
  status: 'confirmed' | 'accepted';
  state: SpotifyControlState;
}

/** Permissions for the personal library: read saved tracks and save/remove tracks. */
export const SPOTIFY_LIBRARY_SCOPES = ['user-library-read', 'user-library-modify'] as const;

export const API_SPOTIFY_LIBRARY_PATH = `${API_SPOTIFY_PATH}/library`;
/** Spotify caps a search page at 10 results (apps in development mode). */
export const SPOTIFY_SEARCH_PAGE_MAX = 10;
export const SPOTIFY_TRACKS_PAGE_MAX = 50;

export interface SpotifyTrack {
  id: string;
  /** `spotify:track:<id>`. */
  uri: string;
  name: string;
  artists: string[];
  album: string | null;
  durationMs: number;
  imageUrl: string | null;
  /** Spotify says it cannot be played (unavailable in the market, local file...). */
  playable: boolean;
  /** Whether the track is in the user's Spotify library, as Spotify reports it. */
  saved: boolean;
}

/** A page of tracks. `nextOffset` is `null` on the last page. */
export interface SpotifyTrackPage {
  tracks: SpotifyTrack[];
  total: number;
  offset: number;
  nextOffset: number | null;
}

/** `PUT`/`DELETE /spotify/library/saved/:trackId`: `saved` is what Spotify reports afterwards. */
export interface SpotifySavedResponse {
  trackId: string;
  saved: boolean;
}

/** `POST /spotify/control/track` */
export interface SpotifyPlayTrackInput {
  trackId: string;
  /** Play inside this playlist (`spotify:playlist:<id>`) so playback continues with its next tracks. */
  contextUri?: string;
  deviceId?: string;
}
