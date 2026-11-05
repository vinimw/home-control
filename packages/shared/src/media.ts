export const API_MEDIA_ACTIVITY_PATH = '/media/activity';

export type MediaSourceKind = 'tv' | 'echo';

/**
 * - `playing` / `paused`: the device reports active or paused playback.
 * - `on`: powered on, but nothing identifiable is playing (a TV that is on is not "playing").
 * - `idle` / `off`: nothing is playing.
 * - `unavailable`: cannot be reached. `unknown`: no usable state reported yet.
 */
export type MediaPlaybackState =
  'playing' | 'paused' | 'on' | 'idle' | 'off' | 'unavailable' | 'unknown';

/** One media source as the integration actually reports it. Missing metadata is `null`, never invented. */
export interface MediaSource {
  /** Same id as in `GET /devices`; actions go through `POST /devices/:id/actions`. */
  deviceId: string;
  name: string;
  kind: MediaSourceKind;
  state: MediaPlaybackState;
  title: string | null;
  artist: string | null;
  /** TV application or input, when reported. */
  app: string | null;
  /** When the device last changed state, used to pick the most recently active source. */
  lastChanged: string | null;
  /** Commands the device offers right now; the UI enables a control only if it is listed. */
  commands: string[];
}

export interface MediaActivityResponse {
  sources: MediaSource[];
  updatedAt: string;
}
