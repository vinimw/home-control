import type {
  SpotifyControlCommand,
  SpotifyControlResult,
  SpotifyControlState,
} from '@home-control/shared';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';

type Failure = Extract<SpotifyResult<unknown>, { ok: false }>;

export interface ControlSnapshot {
  /** The last good state. Kept when a refresh fails (shown as stale); cleared when Spotify is not usable. */
  data: SpotifyControlState | null;
  /** When `data` reached this browser (ms since epoch). */
  receivedAt: number | null;
  /** When playback last changed (track, play/pause or output), as observed here. */
  changedAt: number | null;
  error: Failure | null;
  loaded: boolean;
  /** A command is running: no other command may be sent from the header or the Music page. */
  busy: boolean;
  notice: string | null;
  waitSeconds: number | null;
}

const BASE_MS = 5000;
const MAX_MS = 60_000;
/** Spotify cannot be used here (not configured, not connected, permission missing): look again rarely. */
const UNAVAILABLE_MS = 60_000;
const UNAVAILABLE_CODES = new Set([
  'spotify_connect_required',
  'not_configured',
  'spotify_scope_missing',
]);

export const CONTROL_NOTICE: Record<SpotifyControlResult['status'], string> = {
  confirmed: 'Confirmado: o Spotify mostra a mudança.',
  accepted:
    'O Spotify aceitou o comando, mas a mudança ainda não apareceu. Ela pode demorar alguns segundos.',
};

const INITIAL: ControlSnapshot = {
  data: null,
  receivedAt: null,
  changedAt: null,
  error: null,
  loaded: false,
  busy: false,
  notice: null,
  waitSeconds: null,
};

let snapshot: ControlSnapshot = INITIAL;
const listeners = new Set<() => void>();
let subscribers = 0;
let delay = BASE_MS;
let blockedUntil = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let visibilityHandler: (() => void) | undefined;

function set(patch: Partial<ControlSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((listener) => listener());
}

const sameSession = (a: SpotifyControlState | null, b: SpotifyControlState) =>
  a?.playback?.isPlaying === b.playback?.isPlaying &&
  a?.playback?.trackId === b.playback?.trackId &&
  a?.playback?.device?.id === b.playback?.device?.id;

function accept(data: SpotifyControlState) {
  set({
    data,
    receivedAt: Date.now(),
    changedAt: sameSession(snapshot.data, data) ? snapshot.changedAt : Date.now(),
    error: null,
  });
}

export async function readSpotifyControl(): Promise<void> {
  if (Date.now() < blockedUntil) return;
  const result = await spotifyRequest<SpotifyControlState>('control/state');
  if (!running) return;
  if (result.ok) {
    accept(result.data);
    set({ loaded: true, waitSeconds: null });
    delay = BASE_MS;
    return;
  }
  if (result.code && UNAVAILABLE_CODES.has(result.code)) {
    // Not usable (for example after a disconnect): nothing is shown, and the check slows down.
    set({ loaded: true, error: result, data: null, receivedAt: null, changedAt: null });
    delay = UNAVAILABLE_MS;
    return;
  }
  set({ loaded: true, error: result });
  if (result.code === 'too_many_requests') {
    const seconds = Math.max(result.retryAfter ?? 10, 5);
    delay = Math.min(Math.max(seconds * 1000, delay), MAX_MS);
    blockedUntil = Date.now() + seconds * 1000;
    set({ waitSeconds: seconds });
  } else {
    delay = Math.min(delay * 2, MAX_MS);
  }
}

function schedule() {
  timer = setTimeout(async () => {
    if (document.visibilityState === 'visible') await readSpotifyControl();
    if (running) schedule();
  }, delay);
}

function start() {
  running = true;
  void readSpotifyControl();
  schedule();
  visibilityHandler = () => {
    if (document.visibilityState === 'visible') void readSpotifyControl();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

function stop() {
  running = false;
  clearTimeout(timer);
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
  visibilityHandler = undefined;
}

/**
 * One shared refresh loop for the whole app: the header and the Music page both read this store, so Spotify
 * is read once per cycle however many components show it. The loop runs only while something subscribes.
 */
export function subscribeSpotifyControl(listener: () => void): () => void {
  listeners.add(listener);
  if (++subscribers === 1) start();
  return () => {
    listeners.delete(listener);
    if (--subscribers === 0) stop();
  };
}

export const getSpotifyControlSnapshot = (): ControlSnapshot => snapshot;
export const getSpotifyControlServerSnapshot = (): ControlSnapshot => INITIAL;

/** Sends one command. A result replaces the state (confirmed or accepted); a failure is shown, never hidden. */
async function run(path: string, body: unknown): Promise<void> {
  if (snapshot.busy) return;
  set({ busy: true, notice: null });
  const result = await spotifyRequest<SpotifyControlResult>(path, 'POST', body);
  if (result.ok) {
    accept(result.data.state);
    set({ notice: CONTROL_NOTICE[result.data.status] });
  } else {
    set({
      notice:
        result.code === 'too_many_requests' && result.retryAfter
          ? `O Spotify está limitando as requisições. Tente de novo em ${result.retryAfter} segundos.`
          : result.message,
    });
    if (result.code === 'too_many_requests')
      blockedUntil = Date.now() + (result.retryAfter ?? 5) * 1000;
    else void readSpotifyControl();
  }
  set({ busy: false });
}

export const spotifyControlActions = {
  command: (command: SpotifyControlCommand, deviceId?: string) =>
    run('control/command', { command, ...(deviceId ? { deviceId } : {}) }),
  seek: (positionMs: number) => run('control/seek', { positionMs }),
  transfer: (deviceId: string, play = true) => run('control/transfer', { deviceId, play }),
  playTrack: (trackId: string, contextUri?: string, deviceId?: string) =>
    run('control/track', {
      trackId,
      ...(contextUri ? { contextUri } : {}),
      ...(deviceId ? { deviceId } : {}),
    }),
  playPlaylist: (playlistId: string, deviceId?: string) =>
    run('control/playlist', { playlistId, ...(deviceId ? { deviceId } : {}) }),
};
