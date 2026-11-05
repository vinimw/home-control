'use client';

import { useCallback, useEffect, useState } from 'react';
import type {
  SpotifyPlayerCommand,
  SpotifyPlayerResult,
  SpotifyPlayerState,
} from '@home-control/shared';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';
import { PLAYER_NOTICE } from './spotify-player';

const REFRESH_MS = 5000;

/**
 * Player state read through the API (one Home Assistant entity; no Spotify polling). It refreshes while the
 * page is visible so changes made on the phone or TV show up here.
 */
export function useSpotifyPlayer() {
  const [player, setPlayer] = useState<SpotifyResult<SpotifyPlayerState> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setPlayer(await spotifyRequest<SpotifyPlayerState>('player'));
  }, []);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  const run = useCallback(
    async (path: string, body: unknown) => {
      setBusy(true);
      setNotice(null);
      const result = await spotifyRequest<SpotifyPlayerResult>(path, 'POST', body);
      if (result.ok) {
        setPlayer({ ok: true, data: result.data.player });
        setNotice(PLAYER_NOTICE[result.data.status]);
      } else {
        setNotice(result.message);
        await reload();
      }
      setBusy(false);
    },
    [reload],
  );

  return {
    player,
    busy,
    notice,
    reload,
    command: (command: SpotifyPlayerCommand) => run('player/command', { command }),
    selectSource: (source: string) => run('player/source', { source }),
    playPlaylist: (playlistId: string) => run('player/playlist', { playlistId }),
  };
}
