'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { LoaderCircle, Music2, Pause, Play, SkipBack, SkipForward, Tv } from 'lucide-react';
import type { MediaPlaybackState, MediaSource } from '@home-control/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { executeDeviceCommand } from '@/lib/devices-client';
import { cn } from '@/lib/utils';
import { derivePlayer } from '@/components/spotify/player-model';
import { getSpotifyControlSnapshot } from '@/components/spotify/spotify-control-store';
import { useSpotifyControl } from '@/components/spotify/use-spotify-control';
import { useMediaActivity } from './use-media-activity';

const STATE_LABEL: Record<MediaPlaybackState, string> = {
  playing: 'Tocando',
  paused: 'Pausado',
  on: 'Ligada',
  idle: 'Sem reprodução',
  off: 'Desligada',
  unavailable: 'Indisponível',
  unknown: 'Estado desconhecido',
};

/** A source in use: it is playing, or it is a TV that is on (watching TV is not "paused music"). */
const inUse = (s: MediaSource): boolean =>
  s.state === 'playing' || (s.kind === 'tv' && s.state === 'on');

/**
 * Which source the header highlights: a manual choice, else the most recently changed source in use
 * (playing, or a TV that is on), else the most recent paused one. Paused music never hides an active TV.
 */
export function pickPrimary(sources: MediaSource[], manualId: string | null): MediaSource | null {
  const manual = sources.find((s) => s.deviceId === manualId);
  if (manual) return manual;
  const recent = (list: MediaSource[]) =>
    [...list].sort((a, b) => Date.parse(b.lastChanged ?? '') - Date.parse(a.lastChanged ?? ''))[0];
  return (
    recent(sources.filter(inUse)) ?? recent(sources.filter((s) => s.state === 'paused')) ?? null
  );
}

const SPOTIFY_ID = 'spotify';
const SPOTIFY_COMMAND = {
  previous_track: 'previous',
  next_track: 'next',
  play: 'play',
  pause: 'pause',
} as const;

/**
 * The Spotify session as a header source, from the shared direct-connection state. It exists only for a known
 * track on an active output of an account we may control: otherwise (no session, disconnected, no Premium or
 * permission) the header shows no Spotify controls at all.
 */
function spotifySource(sp: ReturnType<typeof useSpotifyControl>): MediaSource | null {
  const { data, changedAt } = sp;
  if (!data || !data.canControl || data.premium === false) return null;
  const model = derivePlayer(data);
  const track = model.playback?.track;
  if ((model.status !== 'playing' && model.status !== 'paused') || !track || !model.active)
    return null;
  const commands = [
    model.can('skipping_prev') ? 'previous_track' : null,
    model.status === 'playing'
      ? model.can('pausing')
        ? 'pause'
        : null
      : model.can('resuming')
        ? 'play'
        : null,
    model.can('skipping_next') ? 'next_track' : null,
  ].filter((c): c is string => c !== null);
  return {
    deviceId: SPOTIFY_ID,
    name: `Spotify · ${model.active.name}`,
    kind: 'spotify',
    state: model.status === 'playing' ? 'playing' : 'paused',
    title: track.name,
    artist: track.artists.join(', ') || null,
    app: null,
    lastChanged: changedAt ? new Date(changedAt).toISOString() : null,
    commands,
  };
}

const describe = (s: MediaSource): string =>
  [s.title, s.artist].filter(Boolean).join(' · ') ||
  (s.kind === 'tv' && s.app ? `App: ${s.app}` : STATE_LABEL[s.state]);

function Icon({ kind }: { kind: MediaSource['kind'] }) {
  return kind === 'tv' ? (
    <Tv aria-hidden className="size-4" />
  ) : (
    <Music2 aria-hidden className="size-4" />
  );
}

/**
 * Compact "what is playing" control for the header. It only shows what the integrations report, marks
 * unknown/unavailable states as such, and enables a control only when the device offers that command.
 */
export function MediaWidget() {
  const { data, stale, refresh } = useMediaActivity();
  const sp = useSpotifyControl();
  const [toast, setToast] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [manualId, setManualId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    try {
      setManualId(sessionStorage.getItem('media-source'));
    } catch {
      /* storage unavailable: the automatic choice is used */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    const onClick = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  const spotify = spotifySource(sp);
  const sources = [...(data?.sources ?? []), ...(spotify ? [spotify] : [])];
  if (sources.length === 0) return null;
  const primary = pickPrimary(sources, manualId);
  const inline = primary?.kind === 'spotify';
  const pending = sp.busy || busy !== null;

  async function send(source: MediaSource, command: string) {
    if (source.kind === 'spotify') {
      // Direct Spotify command: the result replaces the shared state, so the header and Music stay in sync.
      if (sp.busy) return;
      await sp.command(SPOTIFY_COMMAND[command as keyof typeof SPOTIFY_COMMAND]);
      const notice = getSpotifyControlSnapshot().notice;
      setFeedback(notice);
      setToast(notice);
      return;
    }
    if (busy) return;
    setBusy(`${source.deviceId}:${command}`);
    setFeedback(null);
    const result = await executeDeviceCommand(source.deviceId, command);
    setBusy(null);
    setFeedback(
      result.status === 'confirmed'
        ? 'Confirmado.'
        : result.status === 'accepted'
          ? 'Enviado, ainda não confirmado.'
          : 'Não foi possível enviar o comando.',
    );
    void refresh();
  }

  return (
    <div ref={root} className="relative flex min-w-0 items-center">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-11 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:max-w-xs',
          inline ? 'flex-1' : 'max-w-[11rem]',
        )}
      >
        {primary ? (
          <span className={cn(inline && 'hidden sm:inline-flex')}>
            <Icon kind={primary.kind} />
          </span>
        ) : (
          <Music2 aria-hidden className="size-4" />
        )}
        <span className="truncate">
          <span className="sr-only">Mídia: </span>
          {primary ? describe(primary) : 'Nada tocando'}
        </span>
        {primary && inUse(primary) ? (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full bg-success motion-safe:animate-pulse"
          />
        ) : null}
      </button>

      {inline && primary ? (
        <div role="group" aria-label="Controles do Spotify" className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-10 md:size-11"
            aria-label="Anterior"
            disabled={!primary.commands.includes('previous_track') || pending}
            onClick={() => void send(primary, 'previous_track')}
          >
            <SkipBack aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 md:size-11"
            aria-label={primary.state === 'playing' ? 'Pausar' : 'Tocar'}
            aria-busy={sp.busy}
            disabled={
              !primary.commands.includes(primary.state === 'playing' ? 'pause' : 'play') || pending
            }
            onClick={() => void send(primary, primary.state === 'playing' ? 'pause' : 'play')}
          >
            {sp.busy ? (
              <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
            ) : primary.state === 'playing' ? (
              <Pause aria-hidden />
            ) : (
              <Play aria-hidden />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10 md:size-11"
            aria-label="Próxima"
            disabled={!primary.commands.includes('next_track') || pending}
            onClick={() => void send(primary, 'next_track')}
          >
            <SkipForward aria-hidden />
          </Button>
        </div>
      ) : null}
      {toast && !open ? (
        <p
          role="status"
          className="absolute top-full right-0 z-40 mt-1 max-w-[18rem] rounded-md border bg-background p-2 text-xs shadow-lg"
        >
          {toast}
        </p>
      ) : null}

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Mídia em reprodução"
          className="fixed inset-x-2 top-[calc(3.25rem+env(safe-area-inset-top))] z-40 max-h-[70dvh] overflow-auto rounded-lg border bg-background p-3 shadow-lg md:absolute md:inset-x-auto md:top-full md:right-0 md:mt-1 md:w-96"
        >
          {stale ? (
            <p className="mb-2 text-xs text-muted-foreground" role="status">
              Sem atualização recente: o que aparece pode estar desatualizado.
            </p>
          ) : null}
          <ul className="flex flex-col gap-3">
            {sources.map((source) => {
              const can = (c: string) =>
                source.commands.includes(c) && source.state !== 'unavailable' && !pending;
              const isPrimary = source.deviceId === primary?.deviceId;
              const music = source.kind !== 'tv';
              return (
                <li
                  key={source.deviceId}
                  className={cn('rounded-md border p-3', isPrimary && 'border-primary')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                      <Icon kind={source.kind} />
                      <span className="truncate">{source.name}</span>
                    </p>
                    <Badge variant={source.state === 'playing' ? 'success' : 'muted'}>
                      {STATE_LABEL[source.state]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                    {source.title
                      ? `${source.title}${source.artist ? ` · ${source.artist}` : ''}`
                      : source.kind === 'tv' && source.app
                        ? `App: ${source.app} (o conteúdo não é informado)`
                        : 'Nenhuma faixa identificada.'}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {music ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Anterior em ${source.name}`}
                        disabled={!can('previous_track')}
                        onClick={() => void send(source, 'previous_track')}
                      >
                        <SkipBack aria-hidden />
                      </Button>
                    ) : null}
                    {source.state === 'playing' ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Pausar ${source.name}`}
                        disabled={!can('pause')}
                        onClick={() => void send(source, 'pause')}
                      >
                        <Pause aria-hidden />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Tocar ${source.name}`}
                        disabled={!can('play')}
                        onClick={() => void send(source, 'play')}
                      >
                        <Play aria-hidden />
                      </Button>
                    )}
                    {music ? (
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label={`Próxima em ${source.name}`}
                        disabled={!can('next_track')}
                        onClick={() => void send(source, 'next_track')}
                      >
                        <SkipForward aria-hidden />
                      </Button>
                    ) : (
                      <Link
                        href={`/devices/${source.deviceId}`}
                        onClick={() => setOpen(false)}
                        className="inline-flex h-11 items-center rounded-md border px-3 text-sm hover:bg-accent"
                      >
                        Controle remoto
                      </Link>
                    )}
                    {!isPrimary ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setManualId(source.deviceId);
                          try {
                            sessionStorage.setItem('media-source', source.deviceId);
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        Mostrar no topo
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 min-h-5 text-xs text-muted-foreground" role="status">
            {feedback}
          </p>
          <p className="text-xs text-muted-foreground">
            Estado lido pelo Home Assistant (atualiza a cada poucos segundos).
          </p>
        </div>
      ) : null}
    </div>
  );
}
