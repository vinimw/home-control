'use client';

import { CircleAlert, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type {
  SpotifyPlayerCommand,
  SpotifyPlayerResult,
  SpotifyPlayerState,
} from '@home-control/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export const PLAYER_NOTICE: Record<SpotifyPlayerResult['status'], string> = {
  confirmed: 'Confirmado pelo Spotify.',
  accepted: 'Comando aceito pelo Home Assistant, mas o Spotify ainda não confirmou.',
};

interface Props {
  player: SpotifyPlayerState;
  busy: boolean;
  notice: string | null;
  onCommand: (command: SpotifyPlayerCommand) => void;
  onSource: (source: string) => void;
}

/** Playback controls. Each control appears enabled only when Home Assistant says Spotify accepts it now. */
export function SpotifyPlayer({ player, busy, notice, onCommand, onSource }: Props) {
  const c = player.capabilities;
  return (
    <section aria-label="Player do Spotify" className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Reprodução
      </h3>
      {!player.configured ? (
        <p className="text-sm text-muted-foreground">
          O Home Assistant não tem o player do Spotify. Adicione a integração oficial do Spotify.
        </p>
      ) : (
        <>
          <p className="text-sm">
            {player.track ? (
              <>
                <span className="text-muted-foreground">
                  {player.state === 'playing' ? 'Tocando: ' : 'Pausado: '}
                </span>
                {player.track.title}
                {player.track.artist ? ` · ${player.track.artist}` : ''}
              </>
            ) : (
              <span className="text-muted-foreground">
                {player.state === 'unavailable'
                  ? 'Spotify indisponível no Home Assistant.'
                  : 'Nada tocando. Escolha uma saída para começar.'}
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Controles">
            <Button
              variant="outline"
              size="icon"
              aria-label="Anterior"
              disabled={busy || !c.previous}
              onClick={() => onCommand('previous')}
            >
              <SkipBack aria-hidden />
            </Button>
            {player.state === 'playing' ? (
              <Button
                variant="outline"
                size="icon"
                aria-label="Pausar"
                disabled={busy || !c.pause}
                onClick={() => onCommand('pause')}
              >
                <Pause aria-hidden />
              </Button>
            ) : (
              <Button
                variant="outline"
                size="icon"
                aria-label="Tocar"
                disabled={busy || !c.play}
                onClick={() => onCommand('play')}
              >
                <Play aria-hidden />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              aria-label="Próxima"
              disabled={busy || !c.next}
              onClick={() => onCommand('next')}
            >
              <SkipForward aria-hidden />
            </Button>
          </div>
          {!c.play && !c.pause ? (
            <p className="text-xs text-muted-foreground">
              O Spotify só libera os controles com uma sessão ativa. Escolha uma saída abaixo.
            </p>
          ) : null}
          <div className="flex flex-col gap-1">
            <p className="text-xs text-muted-foreground">Saídas disponíveis no Spotify</p>
            {player.sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma saída disponível. Abra o Spotify no aparelho para ele aparecer.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {player.sources.map((source) => (
                  <li key={source} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                      {source}
                    </span>
                    {player.activeSource === source ? (
                      <Badge variant="success">Ativa</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy || !c.selectSource}
                        onClick={() => onSource(source)}
                      >
                        Usar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
      {notice ? (
        <p className="flex items-start gap-1.5 text-sm" role="status">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {notice}
        </p>
      ) : null}
    </section>
  );
}
