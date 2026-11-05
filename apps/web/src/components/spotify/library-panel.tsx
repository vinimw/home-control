'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import type { SpotifyPlaylist, SpotifyTrack } from '@home-control/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { PlaylistList } from './playlist-list';
import { TrackList } from './track-list';
import { useTrackSource, type TrackSource } from './use-track-source';

type Tab = 'search' | 'saved' | 'playlists';

const TAB_LABEL: Record<Tab, string> = {
  search: 'Buscar',
  saved: 'Curtidas',
  playlists: 'Playlists',
};

interface Props {
  canPlay: boolean;
  playHint: string;
  busy: boolean;
  onPlay: (track: SpotifyTrack, contextUri?: string) => void;
  /** Starts a whole playlist on the active output. */
  onPlayPlaylist: (playlistId: string) => void;
  playlistHint: string;
}

/** Your library: search, saved tracks and the tracks of a playlist. Reading and saving use your account. */
export function LibraryPanel({
  canPlay,
  playHint,
  busy,
  onPlay,
  onPlayPlaylist,
  playlistHint,
}: Props) {
  const [tab, setTab] = useState<Tab>('search');
  // The playlist whose tracks are open (chosen in the Playlists tab).
  const [playlist, setPlaylist] = useState<SpotifyPlaylist | null>(null);
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');

  // Wait for the user to stop typing, and ignore one-letter queries, to keep the request rate low.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim().length >= 2 ? text.trim() : ''), 450);
    return () => clearTimeout(timer);
  }, [text]);

  const source: TrackSource | null = playlist
    ? { kind: 'playlist', id: playlist.id }
    : tab === 'saved'
      ? { kind: 'saved' }
      : query
        ? { kind: 'search', query }
        : null;
  const list = useTrackSource(source);
  const contextUri = playlist ? `spotify:playlist:${playlist.id}` : undefined;

  return (
    <section aria-label="Biblioteca" className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Biblioteca
      </h3>

      {playlist ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPlaylist(null)}>
              <ArrowLeft aria-hidden />
              Voltar
            </Button>
            <p className="min-w-0 truncate text-sm font-medium">{playlist.name}</p>
          </div>
          <TrackList
            source={list}
            emptyText="Esta playlist não tem faixas para mostrar."
            canPlay={canPlay}
            playHint={playHint}
            busy={busy}
            onPlay={(track) => onPlay(track, contextUri)}
          />
        </>
      ) : (
        <>
          <div role="tablist" aria-label="Biblioteca" className="flex gap-1">
            {(['search', 'saved', 'playlists'] as const).map((id) => (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  'min-h-11 rounded-md px-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  tab === id ? 'bg-accent' : 'text-muted-foreground hover:bg-accent/50',
                )}
              >
                {TAB_LABEL[id]}
              </button>
            ))}
          </div>
          {tab === 'search' ? (
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground"
              />
              <Input
                type="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Buscar músicas ou artistas"
                aria-label="Buscar músicas"
                maxLength={100}
                className="pl-9"
              />
            </div>
          ) : null}
          {tab === 'playlists' ? (
            <PlaylistList
              canPlay={canPlay}
              busy={busy}
              hint={playlistHint}
              onPlay={onPlayPlaylist}
              onOpen={setPlaylist}
              showHeading={false}
            />
          ) : source === null ? (
            <p className="text-sm text-muted-foreground">
              {text.trim().length === 1
                ? 'Digite pelo menos 2 letras.'
                : 'Digite o nome de uma música ou artista.'}
            </p>
          ) : (
            <TrackList
              source={list}
              emptyText={
                tab === 'saved'
                  ? 'Você ainda não curtiu nenhuma faixa.'
                  : 'Nenhuma faixa encontrada.'
              }
              canPlay={canPlay}
              playHint={playHint}
              busy={busy}
              onPlay={(track) => onPlay(track)}
            />
          )}
        </>
      )}
    </section>
  );
}
