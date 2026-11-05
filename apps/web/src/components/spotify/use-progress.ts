'use client';

import { useEffect, useState } from 'react';
import type { SpotifyPlayback } from '@home-control/shared';

/** After a failed refresh the position stops advancing after this long: it could be wrong by now. */
const STALE_LIMIT_MS = 10_000;

/**
 * Progress (ms) of the current track. Between Spotify reads it advances locally once a second while the
 * track is playing and the tab is visible, so the bar moves smoothly without any extra request. It is
 * re-based on every fresh state, capped at the track length, frozen when paused and limited when stale.
 */
export function useProgress(
  playback: SpotifyPlayback | null,
  receivedAt: number | null,
  stale: boolean,
): number | null {
  const [now, setNow] = useState(() => Date.now());
  const playing = playback?.isPlaying === true;

  useEffect(() => {
    if (!playing) return;
    const tick = () => document.visibilityState === 'visible' && setNow(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [playing, receivedAt]);

  if (!playback || playback.progressMs === null || receivedAt === null) return null;
  const duration = playback.track?.durationMs ?? Infinity;
  const elapsed = playing
    ? Math.max(0, Math.min(now - receivedAt, stale ? STALE_LIMIT_MS : Infinity))
    : 0;
  return Math.min(playback.progressMs + elapsed, duration);
}
