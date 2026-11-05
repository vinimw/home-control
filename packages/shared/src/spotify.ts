/**
 * Spotify integration contracts. Tokens never appear here: they live only on the API server.
 * Read-only for now: playback control arrives with its own task and its own (additional) permission.
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
