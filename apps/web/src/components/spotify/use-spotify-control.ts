'use client';

import { useSyncExternalStore } from 'react';
import {
  CONTROL_NOTICE,
  getSpotifyControlServerSnapshot,
  getSpotifyControlSnapshot,
  readSpotifyControl,
  spotifyControlActions,
  subscribeSpotifyControl,
} from './spotify-control-store';

export { CONTROL_NOTICE };

/**
 * The account's playback, read straight from Spotify through the API and shared by every component that
 * calls this hook (one refresh loop for the header and the Music page). The refresh is bounded: it runs only
 * while a tab is visible, waits `Retry-After` after a 429 and backs off after failures.
 */
export function useSpotifyControl() {
  const snap = useSyncExternalStore(
    subscribeSpotifyControl,
    getSpotifyControlSnapshot,
    getSpotifyControlServerSnapshot,
  );
  return {
    ...snap,
    /** The last refresh failed, so `data` may be out of date. */
    stale: snap.error !== null && snap.data !== null,
    reload: readSpotifyControl,
    ...spotifyControlActions,
  };
}
