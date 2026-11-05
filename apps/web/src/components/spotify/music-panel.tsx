'use client';

import { useEffect, useRef, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import {
  SPOTIFY_CONTROL_SCOPE,
  SPOTIFY_LIBRARY_SCOPES,
  type SpotifyStatus,
} from '@home-control/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';
import { derivePlayer } from './player-model';
import { LibraryPanel } from './library-panel';
import { PlaylistList } from './playlist-list';
import { MiniPlayer, NowPlaying } from './now-playing';
import { useSpotifyControl } from './use-spotify-control';

/**
 * Music page. Everything goes through the direct Spotify connection. Without it the page explains what to do
 * (configure, connect, reconnect) instead of showing a player that cannot work.
 */
export function MusicPanel() {
  const [status, setStatus] = useState<SpotifyResult<SpotifyStatus> | null>(null);
  const load = () => void spotifyRequest<SpotifyStatus>('status').then(setStatus);

  useEffect(() => {
    load();
  }, []);

  if (status === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Carregando…
      </p>
    );
  }

  if (!status.ok) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="flex items-start gap-1.5 text-sm" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {status.message}
        </p>
        <Button variant="outline" onClick={load}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const s = status.data;
  const needsSetup = !s.configured || !s.connected;
  if (needsSetup) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border p-4">
        <p className="flex items-start gap-1.5 text-sm" role="status">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          {!s.configured
            ? 'O Spotify ainda não foi configurado. Salve o Client ID e o callback em Ajustes.'
            : s.reauthRequired
              ? 'O acesso ao Spotify terminou (revogado ou expirado). Conecte de novo em Ajustes.'
              : 'Conecte sua conta do Spotify em Ajustes para ouvir e controlar a música por aqui.'}
        </p>
        <Link href="/settings" className={buttonVariants({ variant: 'default' })}>
          Abrir Ajustes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {!s.scopes.includes(SPOTIFY_CONTROL_SCOPE) ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-warning" />
          Para controlar a reprodução, conecte de novo e aceite a permissão de controle.
          <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Abrir Ajustes
          </Link>
        </p>
      ) : null}
      <DirectMusicView
        library={SPOTIFY_LIBRARY_SCOPES.every((scope) => s.scopes.includes(scope))}
      />
      {/* Connection details live below the player: they are needed rarely, so they stay out of its way. */}
      <footer className="border-t pt-3 text-xs text-muted-foreground">
        <Link href="/settings" className="underline underline-offset-2">
          Configurar conexão do Spotify
        </Link>
      </footer>
    </div>
  );
}

function DirectMusicView({ library }: { library: boolean }) {
  const spotify = useSpotifyControl();
  const { data, error, stale, loaded, receivedAt } = spotify;
  const nowRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [miniVisible, setMiniVisible] = useState(false);

  // The compact player appears only once the main one has scrolled out of view.
  useEffect(() => {
    const node = controlsRef.current;
    if (!node) return;
    // The sticky header covers the top 56 px, so anything under it counts as out of view.
    const observer = new IntersectionObserver(([entry]) => setMiniVisible(!entry!.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [data !== null]);

  const model = data ? derivePlayer(data) : null;
  const canPlay = model?.controllable === true;
  const reconnect =
    error?.code === 'spotify_connect_required' || error?.code === 'spotify_scope_missing';

  return (
    <>
      {!loaded ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          Carregando o player…
        </p>
      ) : null}
      {loaded && data === null && error ? (
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-start gap-1.5 text-sm" role="alert">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            {error.message}
          </p>
          {reconnect ? (
            <Link href="/settings" className={buttonVariants({ variant: 'outline' })}>
              Conectar de novo em Ajustes
            </Link>
          ) : (
            <Button variant="outline" onClick={() => void spotify.reload()}>
              Tentar de novo
            </Button>
          )}
        </div>
      ) : null}

      {data ? (
        <>
          {!data.canControl ? (
            <p className="flex flex-wrap items-center gap-2 text-sm" role="alert">
              <CircleAlert aria-hidden className="size-4 shrink-0 text-warning" />
              Falta a permissão de controle do Spotify. Conecte de novo e aceite todas as
              permissões.
              <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                Abrir Ajustes
              </Link>
            </p>
          ) : data.premium === false ? (
            <p className="flex items-start gap-1.5 text-sm" role="alert">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />O Spotify
              só permite controlar a reprodução com Premium. Você vê o que toca, mas os controles
              ficam desativados.
            </p>
          ) : null}
          {stale ? (
            <p
              className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              <CircleAlert aria-hidden className="size-4 shrink-0" />
              Sem atualização recente do Spotify: o que aparece pode estar desatualizado.
              <Button variant="ghost" size="sm" onClick={() => void spotify.reload()}>
                Atualizar
              </Button>
            </p>
          ) : null}
          <div ref={nowRef}>
            <NowPlaying
              state={data}
              receivedAt={receivedAt}
              stale={stale}
              busy={spotify.busy}
              onCommand={(command) => void spotify.command(command)}
              onSeek={(ms) => void spotify.seek(ms)}
              onTransfer={(deviceId) => void spotify.transfer(deviceId)}
              controlsRef={controlsRef}
            />
          </div>
          {spotify.waitSeconds ? (
            <p className="text-xs text-muted-foreground" role="status">
              O Spotify está limitando as requisições; a atualização espera {spotify.waitSeconds}s
              antes de tentar de novo.
            </p>
          ) : null}
          {spotify.notice ? (
            <p className="text-sm" role="status">
              {spotify.notice}
            </p>
          ) : null}
        </>
      ) : null}

      {library ? (
        <LibraryPanel
          canPlay={canPlay}
          playHint="Para tocar uma faixa, escolha antes uma saída ativa do Spotify (Trocar saída)."
          busy={spotify.busy}
          onPlay={(track, contextUri) => void spotify.playTrack(track.id, contextUri)}
          onPlayPlaylist={(id) => void spotify.playPlaylist(id)}
          playlistHint="Para tocar uma playlist, escolha antes uma saída ativa do Spotify (Trocar saída)."
        />
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-warning" />
          Para buscar e salvar músicas, conecte de novo e aceite as permissões da biblioteca.
          <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Abrir Ajustes
          </Link>
        </p>
      )}
      {library ? null : (
        <PlaylistList
          canPlay={canPlay}
          busy={spotify.busy}
          hint="Para tocar uma playlist, escolha antes uma saída ativa do Spotify (Trocar saída)."
          onPlay={(id) => void spotify.playPlaylist(id)}
        />
      )}

      {data && miniVisible ? (
        <>
          {/* Keeps the last items of the page from hiding behind the fixed compact player. */}
          <div aria-hidden className="h-16" />
          <MiniPlayer
            state={data}
            receivedAt={receivedAt}
            stale={stale}
            busy={spotify.busy}
            onCommand={(command) => void spotify.command(command)}
            onOpen={() => nowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        </>
      ) : null}
    </>
  );
}
