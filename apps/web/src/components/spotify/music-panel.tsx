'use client';

import { useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { SPOTIFY_CONTROL_SCOPE, type SpotifyStatus } from '@home-control/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';
import { PlaylistList } from './playlist-list';
import { SpotifyDirectPlayer } from './spotify-direct-player';
import { SpotifyPlayer } from './spotify-player';
import { useSpotifyControl } from './use-spotify-control';
import { useSpotifyPlayer } from './use-spotify-player';

type Path = 'direct' | 'ha';
const STORAGE_KEY = 'music-path';

/**
 * Music page. The direct Spotify connection is the default when the account is connected with the
 * playback-control permission; otherwise (or by choice) it falls back to the Home Assistant integration.
 */
export function MusicPanel() {
  const [status, setStatus] = useState<SpotifyResult<SpotifyStatus> | null>(null);
  const [preferred, setPreferred] = useState<Path | null>(null);

  useEffect(() => {
    void spotifyRequest<SpotifyStatus>('status').then(setStatus);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'direct' || saved === 'ha') setPreferred(saved);
    } catch {
      /* storage unavailable: the default applies */
    }
  }, []);

  if (status === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Carregando…
      </p>
    );
  }

  const direct =
    status.ok && status.data.connected && status.data.scopes.includes(SPOTIFY_CONTROL_SCOPE);
  const needsReconnect = status.ok && status.data.connected && !direct;
  const path: Path = direct && preferred !== 'ha' ? 'direct' : 'ha';

  const choose = (next: Path) => {
    setPreferred(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* the choice still applies until the page is closed */
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {path === 'direct'
            ? 'Controlando direto pelo Spotify.'
            : 'Controlando pelo Home Assistant.'}
        </span>
        {direct ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => choose(path === 'direct' ? 'ha' : 'direct')}
          >
            {path === 'direct' ? 'Usar o Home Assistant' : 'Usar o Spotify direto'}
          </Button>
        ) : null}
      </div>
      {needsReconnect ? (
        <p className="flex flex-wrap items-center gap-2 text-sm" role="status">
          <CircleAlert aria-hidden className="size-4 shrink-0 text-warning" />
          Para controlar direto pelo Spotify, conecte de novo e aceite a permissão de controle.
          <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Abrir Ajustes
          </Link>
        </p>
      ) : null}
      {path === 'direct' ? <DirectMusicView /> : <HaMusicView />}
    </div>
  );
}

function DirectMusicView() {
  const spotify = useSpotifyControl();
  const { state } = spotify;
  const active = state?.ok ? state.data.devices.some((d) => d.isActive) : false;
  const allowed = state?.ok ? state.data.canControl && state.data.premium !== false : false;

  return (
    <>
      {state === null ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          Carregando o player…
        </p>
      ) : !state.ok ? (
        <div className="flex flex-col items-start gap-2">
          <p className="flex items-start gap-1.5 text-sm" role="alert">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
            {state.message}
          </p>
          <Button variant="outline" onClick={() => void spotify.reload()}>
            Tentar de novo
          </Button>
        </div>
      ) : (
        <SpotifyDirectPlayer
          state={state.data}
          busy={spotify.busy}
          notice={spotify.notice}
          waitSeconds={spotify.waitSeconds}
          onCommand={(command) => void spotify.command(command)}
          onTransfer={(deviceId) => void spotify.transfer(deviceId)}
        />
      )}
      <PlaylistList
        canPlay={allowed && active}
        busy={spotify.busy}
        hint="Para tocar uma playlist, escolha antes uma saída ativa do Spotify (botão Usar)."
        onPlay={(id) => void spotify.playPlaylist(id)}
      />
    </>
  );
}

function HaMusicView() {
  const spotify = useSpotifyPlayer();
  const { player } = spotify;
  return (
    <>
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
      <PlaylistList
        canPlay={player?.ok === true && player.data.capabilities.playPlaylist}
        busy={spotify.busy}
        hint="Para tocar uma playlist, escolha antes uma saída ativa do Spotify."
        onPlay={(id) => void spotify.playPlaylist(id)}
      />
    </>
  );
}
