'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, Lightbulb, LoaderCircle, Pencil, Power, PowerOff } from 'lucide-react';
import type {
  CustomDevice,
  CustomDeviceAction,
  CustomDeviceLink,
  CustomDeviceLinkStatus,
} from '@home-control/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { describeCustomError, executeCustomDevice } from '@/lib/custom-devices-client';
import { cn } from '@/lib/utils';
import { FavoriteButton } from './favorite-button';

const LINK_NOTE: Record<Exclude<CustomDeviceLinkStatus, 'ready'>, string> = {
  unset: 'sem comando escolhido',
  missing_command: 'o comando salvo foi excluído',
  echo_missing: 'o Echo do comando não aparece no Home Assistant',
  echo_unavailable: 'o Echo do comando está indisponível',
};

const ACTION_LABEL: Record<CustomDeviceAction, string> = { on: 'Ligar', off: 'Desligar' };

const timeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Honest wording: a request was sent or refused. Nothing here says what the light did. */
export function describeLastCommand(device: CustomDevice): string | null {
  const last = device.lastCommand;
  if (!last) return null;
  const when = timeFormat.format(new Date(last.at));
  const what = ACTION_LABEL[last.action];
  return last.status === 'accepted'
    ? `Último comando: ${what}, enviado em ${when}. O Home Assistant aceitou, mas não dá para saber se a luz mudou.`
    : `Último comando: ${what}, falhou em ${when}. ${describeCustomError(last.error?.code)}`;
}

interface Props {
  device: CustomDevice;
  /** The server's view of the card after a request, so the list stays in step. */
  onChange: (device: CustomDevice) => void;
  onToggleFavorite: (device: CustomDevice) => void;
}

function CustomDeviceTileImpl({ device, onChange, onToggleFavorite }: Props) {
  const [pending, setPending] = useState<CustomDeviceAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: CustomDeviceAction) => {
    if (pending) return; // blocks a second click while one request is in flight
    setPending(action);
    setError(null);
    const result = await executeCustomDevice(device.id, action);
    if (result.ok) onChange(result.data.device);
    else if (result.result) onChange(result.result.device);
    else setError(result.message);
    setPending(null);
  };

  const buttons: Array<{ action: CustomDeviceAction; link: CustomDeviceLink }> = [
    { action: 'on', link: device.on },
    { action: 'off', link: device.off },
  ];
  const notes = buttons
    .filter(({ link }) => link.status !== 'ready')
    .map(
      ({ action, link }) =>
        `${ACTION_LABEL[action]}: ${LINK_NOTE[link.status as Exclude<CustomDeviceLinkStatus, 'ready'>]}`,
    );
  const last = describeLastCommand(device);

  return (
    <Card data-testid="custom-device">
      <CardHeader className="pb-1">
        <div className="flex min-h-11 items-center justify-between gap-2">
          <CardTitle className="flex min-w-0 items-center gap-1.5 text-sm [overflow-wrap:anywhere]">
            <Lightbulb aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            {device.name}
          </CardTitle>
          <div className="-mr-1 flex shrink-0 items-center gap-1">
            <FavoriteButton device={device} onToggle={onToggleFavorite} />
            <Link
              href={`/devices/custom?edit=${device.id}`}
              aria-label={`Editar ${device.name}`}
              title="Editar"
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }))}
            >
              <Pencil aria-hidden />
            </Link>
          </div>
        </div>
        {device.room ? (
          <CardDescription className="text-xs">{device.room.name}</CardDescription>
        ) : null}
        <CardDescription className="text-xs">
          Estado desconhecido: controlado pela Alexa, o app não sabe se a luz está ligada.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          {buttons.map(({ action, link }) => (
            <Button
              key={action}
              variant={action === 'on' ? 'secondary' : 'outline'}
              aria-label={`${ACTION_LABEL[action]} ${device.name}`}
              aria-busy={pending === action}
              disabled={link.status !== 'ready' || pending !== null}
              onClick={() => void run(action)}
            >
              {pending === action ? (
                <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
              ) : action === 'on' ? (
                <Power aria-hidden />
              ) : (
                <PowerOff aria-hidden />
              )}
              {ACTION_LABEL[action]}
            </Button>
          ))}
        </div>

        <div role="status" aria-live="polite" className="flex flex-col gap-1 text-xs empty:hidden">
          {pending ? <span className="text-muted-foreground">Enviando para a Alexa…</span> : null}
          {error ? (
            <span className="flex items-start gap-1.5 text-sm">
              <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
              {error}
            </span>
          ) : null}
        </div>
        {last ? <p className="text-xs text-muted-foreground">{last}</p> : null}
        {notes.length > 0 ? (
          <p className="text-xs text-muted-foreground">Desativado: {notes.join('; ')}.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const CustomDeviceTile = memo(CustomDeviceTileImpl);
