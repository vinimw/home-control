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
