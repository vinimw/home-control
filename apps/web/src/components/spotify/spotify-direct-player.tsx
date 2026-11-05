'use client';

import Link from 'next/link';
import { CircleAlert, Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { SpotifyControlCommand, SpotifyControlState } from '@home-control/shared';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';

interface Props {
  state: SpotifyControlState;
  busy: boolean;
  notice: string | null;
  waitSeconds: number | null;
  onCommand: (command: SpotifyControlCommand) => void;
  onTransfer: (deviceId: string) => void;
}

/** Now playing, controls and outputs read straight from the Spotify account. */
export function SpotifyDirectPlayer({
  state,
  busy,
  notice,
  waitSeconds,
  onCommand,
  onTransfer,
}: Props) {
  const { playback, devices } = state;
  const active = devices.find((d) => d.isActive) ?? playback?.device ?? null;
  const blocked = !state.canControl || state.premium === false;
  const allowed = (action: string) =>
    !blocked && !busy && active !== null && !playback?.disallowed.includes(action);

  return (
    <section aria-label="Player do Spotify" className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Reprodução
      </h3>

      {!state.canControl ? (
        <p className="flex items-start gap-1.5 text-sm" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          <span>
            Falta a permissão de controle do Spotify. Em Ajustes, use &quot;Conectar de novo&quot; e
            aceite todas as permissões.{' '}
            <Link href="/settings" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              Abrir Ajustes
            </Link>
          </span>
        </p>
      ) : state.premium === false ? (
        <p className="flex items-start gap-1.5 text-sm" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />O Spotify só
          permite controlar a reprodução com uma conta Premium. Você pode ver o que toca, mas os
          controles ficam desativados.
        </p>
      ) : null}

      <p className="text-sm">
        {playback?.track ? (
          <>
            <span className="text-muted-foreground">
              {playback.isPlaying ? 'Tocando: ' : 'Pausado: '}
            </span>
            {playback.track.name} · {playback.track.artists.join(', ')}
            {playback.track.album ? (
              <span className="block text-xs text-muted-foreground">{playback.track.album}</span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">Nada tocando agora.</span>
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        Saída ativa: {active ? active.name : 'nenhuma'}
      </p>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Controles">
        <Button
          variant="outline"
          size="icon"
          aria-label="Anterior"
          disabled={!allowed('skipping_prev')}
          onClick={() => onCommand('previous')}
        >
          <SkipBack aria-hidden />
        </Button>
        {playback?.isPlaying ? (
          <Button
            variant="outline"
            size="icon"
            aria-label="Pausar"
            disabled={!allowed('pausing')}
            onClick={() => onCommand('pause')}
          >
            <Pause aria-hidden />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="icon"
            aria-label="Tocar"
            disabled={!allowed('resuming')}
            onClick={() => onCommand('play')}
          >
            <Play aria-hidden />
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          aria-label="Próxima"
          disabled={!allowed('skipping_next')}
          onClick={() => onCommand('next')}
        >
          <SkipForward aria-hidden />
        </Button>
      </div>
      {active === null && state.canControl ? (
        <p className="text-xs text-muted-foreground">
          Sem saída ativa: escolha uma abaixo (&quot;Usar&quot;) ou abra o Spotify em um aparelho.
        </p>
      ) : null}

      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">Saídas disponíveis no Spotify</p>
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma saída disponível. Abra o Spotify no celular, no computador, na TV ou no Echo
            para ela aparecer.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {devices.map((device) => (
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
                    disabled={blocked || busy || device.isRestricted || device.id === null}
                    title={
                      device.isRestricted ? 'O Spotify não permite controlar esta saída' : undefined
                    }
                    onClick={() => device.id && onTransfer(device.id)}
                  >
                    Usar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {waitSeconds ? (
        <p className="text-xs text-muted-foreground" role="status">
          O Spotify está limitando as requisições; a atualização espera {waitSeconds}s antes de
          tentar de novo.
        </p>
      ) : null}
      {notice ? (
        <p className="flex items-start gap-1.5 text-sm" role="status">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {notice}
        </p>
      ) : null}
    </section>
  );
}
