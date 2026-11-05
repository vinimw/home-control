'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { SpotifyPlaylistsResponse } from '@home-control/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';

interface Props {
  /** The player accepts "start a playlist" right now. */
  canPlay: boolean;
  busy: boolean;
  /** Why playing is not possible now (shown once above the list). */
  hint: string;
  onPlay: (playlistId: string) => void;
}

/** The account's playlists (read through the direct connection) with a play button each. */
export function PlaylistList({ canPlay, busy, hint, onPlay }: Props) {
  const [playlists, setPlaylists] = useState<SpotifyResult<SpotifyPlaylistsResponse> | null>(null);
  const load = useCallback(async () => {
    setPlaylists(await spotifyRequest<SpotifyPlaylistsResponse>('playlists'));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  return (
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
          {playlists.code === 'spotify_connect_required' || playlists.code === 'not_configured' ? (
            <Link href="/settings" className={buttonVariants({ variant: 'outline' })}>
              Conectar em Ajustes
            </Link>
          ) : (
            <Button variant="outline" onClick={() => void load()}>
              Tentar de novo
            </Button>
          )}
        </div>
      ) : playlists.data.playlists.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma playlist encontrada.</p>
      ) : (
        <>
          {!canPlay ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
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
                  disabled={busy || !canPlay}
                  onClick={() => onPlay(playlist.id)}
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
  );
}
