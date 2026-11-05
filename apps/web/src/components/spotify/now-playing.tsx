'use client';

import { useId, useState, type Ref } from 'react';
import { ChevronDown, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { SpotifyControlCommand, SpotifyControlState } from '@home-control/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { derivePlayer, formatTime, type PlayerStatus } from './player-model';
import { useProgress } from './use-progress';

const STATUS_BADGE: Record<PlayerStatus, 'success' | 'muted' | 'warning'> = {
  playing: 'success',
  paused: 'muted',
  no_metadata: 'muted',
  idle: 'muted',
  no_output: 'warning',
  read_only: 'warning',
};

export interface PlayerProps {
  state: SpotifyControlState;
  receivedAt: number | null;
  stale: boolean;
  busy: boolean;
  onCommand: (command: SpotifyControlCommand) => void;
}

/** Album artwork, or a neutral placeholder when Spotify has none. */
export function Artwork({ url, className }: { url: string | null; className?: string }) {
  return url ? (
    // Spotify's CDN image; decorative, so no alt text and no referrer is sent.
    <img
      src={url}
      alt=""
      referrerPolicy="no-referrer"
      className={cn('shrink-0 rounded-md object-cover', className)}
    />
  ) : (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground',
        className,
      )}
    >
      <Music2 className="size-1/3" />
    </div>
  );
}

/** The one place for previous / play-pause / next, with the primary action emphasized. */
export function TransportControls({
  state,
  busy,
  onCommand,
  size = 'large',
}: Pick<PlayerProps, 'state' | 'busy' | 'onCommand'> & { size?: 'large' | 'compact' }) {
  const model = derivePlayer(state);
  const playing = model.playback?.isPlaying === true;
  const big = size === 'large';
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Controles de reprodução">
      <Button
        variant="ghost"
        size="icon"
        aria-label="Anterior"
        disabled={busy || !model.can('skipping_prev')}
        onClick={() => onCommand('previous')}
      >
        <SkipBack aria-hidden />
      </Button>
      <Button
        variant="default"
        size="icon"
        aria-label={playing ? 'Pausar' : 'Tocar'}
        disabled={busy || !model.can(playing ? 'pausing' : 'resuming')}
        onClick={() => onCommand(playing ? 'pause' : 'play')}
        className={cn('rounded-full', big ? 'size-14 [&_svg]:size-6' : 'size-11')}
      >
        {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Próxima"
        disabled={busy || !model.can('skipping_next')}
        onClick={() => onCommand('next')}
      >
        <SkipForward aria-hidden />
      </Button>
    </div>
  );
}

interface NowPlayingProps extends PlayerProps {
  /** Attached to the main controls so the page knows when they scroll out of view. */
  controlsRef?: Ref<HTMLDivElement>;
  onSeek: (positionMs: number) => void;
  onTransfer: (deviceId: string) => void;
}

/** The player card: artwork, track, status, controls, progress and the active output. */
export function NowPlaying({
  state,
  receivedAt,
  stale,
  busy,
  onCommand,
  onSeek,
  onTransfer,
  controlsRef,
}: NowPlayingProps) {
  const id = useId();
  const model = derivePlayer(state);
  const { playback, active } = model;
  const track = playback?.track ?? null;
  const progress = useProgress(playback, receivedAt, stale);
  const duration = track?.durationMs ?? 0;
  const canSeek = model.can('seeking') && duration > 0 && !busy;
  const [drag, setDrag] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);

  const commitSeek = () => {
    if (drag !== null) onSeek(drag);
    setDrag(null);
  };

  return (
    <section
      aria-label="Tocando agora"
      className="flex flex-col gap-4 rounded-xl border bg-card p-4"
    >
      <div className="flex gap-4">
        <Artwork url={track?.imageUrl ?? null} className="size-24 sm:size-32" />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
          <Badge variant={STATUS_BADGE[model.status]} className="self-start">
            {model.label}
          </Badge>
          {track ? (
            <>
              <h2 className="text-lg leading-tight font-semibold [overflow-wrap:anywhere] sm:text-xl">
                {track.name}
              </h2>
              <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {track.artists.join(', ') || 'Artista desconhecido'}
              </p>
              {track.album ? (
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {track.album}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {model.status === 'no_output'
                ? 'Abra o Spotify no celular, no computador, na TV ou no Echo para uma saída aparecer.'
                : model.status === 'idle'
                  ? 'Nada tocando. Escolha uma saída abaixo ou toque algo da biblioteca.'
                  : model.status === 'no_metadata'
                    ? 'O Spotify não informou a faixa (pode ser um anúncio ou outro conteúdo).'
                    : 'Os controles ficam desativados.'}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <input
          type="range"
          aria-label="Posição da faixa"
          aria-valuetext={`${formatTime(drag ?? progress)} de ${formatTime(duration || null)}`}
          min={0}
          max={Math.max(duration, 1)}
          step={1000}
          value={drag ?? progress ?? 0}
          disabled={!canSeek}
          onChange={(event) => setDrag(Number(event.target.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
          onBlur={commitSeek}
          className="h-6 w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
          <span>{formatTime(drag ?? progress)}</span>
          <span>{track ? formatTime(duration) : '–:––'}</span>
        </div>
        {track && !model.can('seeking') && model.controllable ? (
          <p className="text-xs text-muted-foreground">
            O Spotify não permite mudar a posição nesta faixa.
          </p>
        ) : null}
      </div>

      <div ref={controlsRef} className="flex justify-center">
        <TransportControls state={state} busy={busy} onCommand={onCommand} />
      </div>

      <div className="flex flex-col gap-2 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm">
            <span className="text-muted-foreground">Saída: </span>
            {active ? <span className="font-medium">{active.name}</span> : 'nenhuma ativa'}
          </p>
          <Button
            variant="outline"
            size="sm"
            aria-expanded={picker}
            aria-controls={`${id}-outputs`}
            onClick={() => setPicker((v) => !v)}
          >
            Trocar saída
            <ChevronDown
              aria-hidden
              className={cn(
                'transition-transform motion-reduce:transition-none',
                picker && 'rotate-180',
              )}
            />
          </Button>
        </div>
        {picker ? (
          <ul id={`${id}-outputs`} className="divide-y rounded-md border">
            {state.devices.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">
                Nenhuma saída disponível. Abra o Spotify em um aparelho.
              </li>
            ) : (
              state.devices.map((device) => (
                <li key={device.id ?? device.name} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm [overflow-wrap:anywhere]">{device.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {device.type}
                      {device.volumePercent !== null ? ` · volume ${device.volumePercent}%` : ''}
                    </p>
                  </div>
                  {device.isRestricted ? <Badge variant="warning">Restrita</Badge> : null}
                  {device.isActive ? (
                    <Badge variant="success">Ativa</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={
                        !state.canControl ||
                        state.premium === false ||
                        busy ||
                        device.isRestricted ||
                        device.id === null
                      }
                      title={
                        device.isRestricted
                          ? 'O Spotify não permite controlar esta saída'
                          : undefined
                      }
                      onClick={() => {
                        if (device.id) onTransfer(device.id);
                        setPicker(false);
                      }}
                    >
                      Usar
                    </Button>
                  )}
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </section>
  );
}

/** A thin player that stays reachable while browsing: track, play/pause, previous/next and progress. */
export function MiniPlayer({
  state,
  receivedAt,
  stale,
  busy,
  onCommand,
  onOpen,
}: PlayerProps & { onOpen: () => void }) {
  const model = derivePlayer(state);
  const track = model.playback?.track ?? null;
  const progress = useProgress(model.playback, receivedAt, stale);
  const duration = track?.durationMs ?? 0;
  const pct = duration > 0 && progress !== null ? Math.min(100, (progress / duration) * 100) : 0;
  return (
    <div
      role="region"
      aria-label="Player compacto"
      className="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-20 border-t bg-background/95 backdrop-blur md:bottom-0 md:left-60"
    >
      <div aria-hidden className="h-0.5 bg-muted">
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-1">
        <button
          type="button"
          onClick={onOpen}
          aria-label="Voltar ao player"
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Artwork url={track?.imageUrl ?? null} className="size-10" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {track ? track.name : model.label}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {track ? track.artists.join(', ') : (model.active?.name ?? 'Sem saída ativa')}
            </span>
          </span>
        </button>
        <TransportControls state={state} busy={busy} onCommand={onCommand} size="compact" />
      </div>
    </div>
  );
}
