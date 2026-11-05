'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  SpotifyControlCommand,
  SpotifyControlResult,
  SpotifyControlState,
} from '@home-control/shared';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';

const BASE_MS = 5000;
const MAX_MS = 60_000;

export const CONTROL_NOTICE: Record<SpotifyControlResult['status'], string> = {
  confirmed: 'Confirmado: o Spotify mostra a mudança.',
  accepted:
    'O Spotify aceitou o comando, mas a mudança ainda não apareceu. Ela pode demorar alguns segundos.',
};

/**
 * Reads the account's playback state straight from Spotify (through the API). The refresh is bounded: it
 * only runs while the tab is visible, waits at least `Retry-After` after a 429, and backs off (5 s up to
 * 60 s) after other failures. A command result replaces the state, so no extra read is needed.
 */
export function useSpotifyControl() {
  const [state, setState] = useState<SpotifyResult<SpotifyControlState> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);
  const delay = useRef(BASE_MS);
  const blockedUntil = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stopped = useRef(false);

  const read = useCallback(async (): Promise<void> => {
    if (Date.now() < blockedUntil.current) return;
    const result = await spotifyRequest<SpotifyControlState>('control/state');
    if (stopped.current) return;
    setState(result);
    if (result.ok) {
      delay.current = BASE_MS;
      setWaitSeconds(null);
    } else if (result.code === 'too_many_requests') {
      const seconds = Math.max(result.retryAfter ?? 10, 5);
      delay.current = Math.min(Math.max(seconds * 1000, delay.current), MAX_MS);
      blockedUntil.current = Date.now() + seconds * 1000;
      setWaitSeconds(seconds);
    } else {
      delay.current = Math.min(delay.current * 2, MAX_MS);
    }
  }, []);

  useEffect(() => {
    stopped.current = false;
    const schedule = () => {
      timer.current = setTimeout(async () => {
        if (document.visibilityState === 'visible') await read();
        if (!stopped.current) schedule();
      }, delay.current);
    };
    void read();
    schedule();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void read();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped.current = true;
      clearTimeout(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [read]);

  const run = useCallback(
    async (path: string, body: unknown) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      const result = await spotifyRequest<SpotifyControlResult>(path, 'POST', body);
      if (result.ok) {
        setState({ ok: true, data: result.data.state });
        setNotice(CONTROL_NOTICE[result.data.status]);
      } else {
        setNotice(
          result.code === 'too_many_requests' && result.retryAfter
            ? `O Spotify está limitando as requisições. Tente de novo em ${result.retryAfter} segundos.`
            : result.message,
        );
        if (result.code === 'too_many_requests') {
          blockedUntil.current = Date.now() + (result.retryAfter ?? 5) * 1000;
        } else {
          void read();
        }
      }
      setBusy(false);
    },
    [busy, read],
  );

  return {
    state,
    busy,
    notice,
    waitSeconds,
    reload: read,
    command: (command: SpotifyControlCommand, deviceId?: string) =>
      run('control/command', { command, ...(deviceId ? { deviceId } : {}) }),
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
}
