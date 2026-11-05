'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import type { SpotifyPlaylistsResponse } from '@home-control/shared';
import { buttonVariants, Button } from '@/components/ui/button';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';
import { SpotifyPlayer } from './spotify-player';
import { useSpotifyPlayer } from './use-spotify-player';

/** Spotify player page: now playing, controls, outputs and playlists, each with its own honest state. */
export function MusicPanel() {
  const spotify = useSpotifyPlayer();
  const [playlists, setPlaylists] = useState<SpotifyResult<SpotifyPlaylistsResponse> | null>(null);

  const loadPlaylists = useCallback(async () => {
    setPlaylists(await spotifyRequest<SpotifyPlaylistsResponse>('playlists'));
  }, []);
  useEffect(() => {
    void loadPlaylists();
  }, [loadPlaylists]);

  const { player } = spotify;
  const canPlayPlaylist = player?.ok && player.data.capabilities.playPlaylist;

  return (
    <div className="flex flex-col gap-6">
      {player === null ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          Carregando o player…
        </p>
      ) : !player.ok ? (
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-start gap-1.5 text-sm" role="alert">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            {player.message}
          </p>
          <Button variant="outline" onClick={() => void spotify.reload()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <SpotifyPlayer
          player={player.data}
          busy={spotify.busy}
          notice={spotify.notice}
          onCommand={(command) => void spotify.command(command)}
          onSource={(source) => void spotify.selectSource(source)}
        />
      )}

      <section aria-label="Playlists" className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Playlists
        </h3>
        {playlists === null ? (
          <p role="status" className="text-sm text-muted-foreground">
            Carregando playlists…
          </p>
        ) : !playlists.ok ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm" role="alert">
              {playlists.message}
            </p>
            {playlists.code === 'spotify_connect_required' ||
            playlists.code === 'not_configured' ? (
              <Link href="/settings" className={buttonVariants({ variant: 'outline' })}>
                Conectar em Ajustes
              </Link>
            ) : null}
          </div>
        ) : playlists.data.playlists.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma playlist encontrada.</p>
        ) : (
          <>
            {!canPlayPlaylist ? (
              <p className="text-xs text-muted-foreground">
                Para tocar uma playlist, escolha antes uma saída ativa do Spotify.
              </p>
            ) : null}
            <ul className="divide-y rounded-md border">
              {playlists.data.playlists.map((playlist) => (
                <li key={playlist.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{playlist.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {playlist.tracks !== null
                        ? `${playlist.tracks} faixas`
                        : 'Faixas indisponíveis'}
                      {playlist.owner ? ` · ${playlist.owner}` : ''}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={spotify.busy || !canPlayPlaylist}
                    onClick={() => void spotify.playPlaylist(playlist.id)}
                  >
                    Tocar
                  </Button>
                </li>
              ))}
            </ul>
            {playlists.data.total > playlists.data.playlists.length ? (
              <p className="text-xs text-muted-foreground">
                Mostrando {playlists.data.playlists.length} de {playlists.data.total}.
              </p>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
