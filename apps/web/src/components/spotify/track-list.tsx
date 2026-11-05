'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CircleAlert, Heart, LoaderCircle } from 'lucide-react';
import type { SpotifyTrack } from '@home-control/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { useTrackSource } from './use-track-source';

type Source = ReturnType<typeof useTrackSource>;

interface Props {
  source: Source;
  /** Shown when there is nothing to list and no error. */
  emptyText: string;
  /** The player accepts "play this track" right now. */
  canPlay: boolean;
  /** Why playing is not possible now. */
  playHint: string;
  busy: boolean;
  onPlay: (track: SpotifyTrack) => void;
}

const minutes = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;

/** Tracks with play and save/remove, plus loading, empty, error, reconnect and rate-limit states. */
export function TrackList({ source, emptyText, canPlay, playHint, busy, onPlay }: Props) {
  const { tracks, total, loading, error, savingId, hasMore } = source;
  const [saveError, setSaveError] = useState<string | null>(null);

  if (error && tracks.length === 0) {
    const reconnect =
      error.code === 'spotify_scope_missing' || error.code === 'spotify_connect_required';
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-start gap-1.5 text-sm" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error.code === 'too_many_requests' && error.retryAfter
            ? `O Spotify está limitando as requisições. Tente de novo em ${error.retryAfter} segundos.`
            : error.message}
        </p>
        {reconnect ? (
          <Link href="/settings" className={buttonVariants({ variant: 'outline' })}>
            Conectar de novo em Ajustes
          </Link>
        ) : error.code === 'spotify_content_unavailable' ? null : (
          <Button variant="outline" onClick={() => void source.reload()}>
            Tentar de novo
          </Button>
        )}
      </div>
    );
  }
  if (loading && tracks.length === 0) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Carregando…
      </p>
    );
  }
  if (tracks.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <div className="flex flex-col gap-2">
      {!canPlay ? <p className="text-xs text-muted-foreground">{playHint}</p> : null}
      <ul className="divide-y rounded-md border">
        {tracks.map((track) => (
          <li key={track.id} className="flex items-center gap-2 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">{track.name}</p>
              <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {track.artists.join(', ') || 'Artista desconhecido'}
                {track.album ? ` · ${track.album}` : ''}
                {track.durationMs ? ` · ${minutes(track.durationMs)}` : ''}
              </p>
              {!track.playable ? (
                <p className="text-xs text-warning">
                  Indisponível para tocar no seu país ou conta.
                </p>
              ) : null}
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                track.saved
                  ? `Remover ${track.name} das curtidas`
                  : `Salvar ${track.name} nas curtidas`
              }
              aria-pressed={track.saved}
              disabled={savingId !== null}
              onClick={async () => setSaveError(await source.toggleSaved(track))}
            >
              {savingId === track.id ? (
                <LoaderCircle aria-hidden className="animate-spin" />
              ) : (
                <Heart aria-hidden className={cn(track.saved && 'fill-current text-primary')} />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy || !canPlay || !track.playable}
              onClick={() => onPlay(track)}
            >
              Tocar
            </Button>
          </li>
        ))}
      </ul>
      {saveError ? (
        <p className="text-xs text-destructive" role="alert">
          {saveError}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error.code === 'too_many_requests' && error.retryAfter
            ? `Limite do Spotify: tente de novo em ${error.retryAfter} segundos.`
            : error.message}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        {hasMore ? (
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void source.loadMore()}
          >
            {loading ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
            Carregar mais
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {tracks.length} de {total}
        </span>
      </div>
    </div>
  );
}
