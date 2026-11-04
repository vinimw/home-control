'use client';

import { useCallback, type ReactNode } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Home,
  Pause,
  Play,
  SearchX,
  Undo2,
  Volume1,
  Volume2,
  WifiOff,
} from 'lucide-react';
import type { Device, DeviceListResponse, RemoteKey } from '@home-control/shared';
import {
  AvailabilityIndicator,
  ControlStatus,
  LevelSlider,
  PowerSwitch,
  useDeviceCommand,
  type ExecuteCommand,
} from '@/components/controls';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { executeDeviceCommand } from '@/lib/devices-client';
import { cn } from '@/lib/utils';
import { useDevices } from './use-devices';

const KEY_LABEL: Record<RemoteKey, string> = {
  up: 'Para cima',
  down: 'Para baixo',
  left: 'Para a esquerda',
  right: 'Para a direita',
  ok: 'OK',
  home: 'Início',
  back: 'Voltar',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

/**
 * The TV remote. Everything shown comes from the commands the device REALLY offers (`device.commands`):
 * a key, app or source the API does not list is never rendered. One status line serves the whole remote
 * and, like every control, only says "confirmado" when the API observed the effect.
 */
export function TvRemote({
  initial,
  deviceId,
}: {
  initial: DeviceListResponse | null;
  deviceId: string;
}) {
  const { devices, loaded, stale, apply, refresh } = useDevices(initial);
  const device = devices.find((candidate) => candidate.id === deviceId);

  const execute = useCallback<ExecuteCommand>(
    async (command, params) => {
      const result = await executeDeviceCommand(deviceId, command, params);
      if (result.device) apply(result.device);
      return result;
    },
    [deviceId, apply],
  );

  if (!device) {
    return loaded ? (
      <EmptyState
        icon={SearchX}
        title="Dispositivo não encontrado"
        description="Ele pode ter sido removido do Home Assistant ou estar escondido."
      />
    ) : (
      <EmptyState
        icon={WifiOff}
        title="Não foi possível carregar o dispositivo"
        description={stale ? 'O servidor não respondeu. Tente de novo.' : 'Carregando…'}
      >
        <Button onClick={() => void refresh()}>Tentar de novo</Button>
      </EmptyState>
    );
  }
  return <RemoteBody device={device} execute={execute} />;
}

function commandOptions(device: Device, name: string): string[] {
  const spec = device.commands.find((command) => command.name === name);
  return spec?.params[0]?.options ?? [];
}

function RemoteBody({ device, execute }: { device: Device; execute: ExecuteCommand }) {
  const has = (name: string) => device.commands.some((command) => command.name === name);
  const blocked = device.availability === 'unavailable';
  const { state: status, run } = useDeviceCommand(execute);
  const send = (command: string, params?: Record<string, unknown>) => void run(command, params);

  const keys = new Set(commandOptions(device, 'press_key'));
  const apps = commandOptions(device, 'launch_app');
  // Apps appear in the TV's source list too; they live under "Aplicativos", so inputs show only the rest.
  const appNames = new Set(apps.map((app) => app.toLowerCase()));
  const sources = commandOptions(device, 'select_source').filter(
    (source) => !appNames.has(source.toLowerCase()),
  );
  const { state } = device;

  const keyButton = (key: RemoteKey, icon: ReactNode, className?: string, label?: ReactNode) =>
    keys.has(key) ? (
      <Button
        variant={key === 'ok' ? 'default' : 'secondary'}
        className={cn('h-14 min-h-14', className)}
        aria-label={KEY_LABEL[key]}
        disabled={blocked}
        onClick={() => send('press_key', { key })}
      >
        {icon}
        {label}
      </Button>
    ) : (
      <span aria-hidden className={className} />
    );

  const hasDpad = ['up', 'down', 'left', 'right', 'ok'].some((key) => keys.has(key as RemoteKey));

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {device.name}
          </h1>
          <p className="text-xs text-muted-foreground">
            {state.power === 'on'
              ? 'Ligada'
              : state.power === 'off'
                ? 'Desligada'
                : 'Estado desconhecido'}
            {state.source ? ` · ${state.source}` : ''}
          </p>
        </div>
        <AvailabilityIndicator availability={device.availability} />
      </div>

      {blocked ? (
        <Alert variant="danger">
          <WifiOff aria-hidden />
          <div>
            <AlertTitle>TV indisponível</AlertTitle>
            <AlertDescription>
              O Home Assistant não consegue falar com a TV. Os controles ficam desativados.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {/* One status line for the whole remote. */}
      <ControlStatus state={status} className="min-h-6 justify-center" />

      {has('turn_on') || has('turn_off') ? (
        <Section title="Energia">
          {has('turn_on') && has('turn_off') ? (
            <PowerSwitch
              label="Ligada"
              checked={state.power === null ? null : state.power === 'on'}
              onCommand={execute}
              disabled={blocked}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {has('turn_off') ? (
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={blocked}
                  onClick={() => send('turn_off')}
                >
                  Desligar
                </Button>
              ) : null}
              {has('turn_on') ? (
                <Button
                  variant="secondary"
                  className="flex-1"
                  disabled={blocked}
                  onClick={() => send('turn_on')}
                >
                  Ligar
                </Button>
              ) : null}
            </div>
          )}
        </Section>
      ) : null}

      {apps.length > 0 ? (
        <Section title="Aplicativos">
          <div className="grid grid-cols-2 gap-2">
            {apps.map((app) => (
              <Button
                key={app}
                variant="secondary"
                className="h-14"
                disabled={blocked}
                onClick={() => send('launch_app', { app })}
              >
                {app}
              </Button>
            ))}
          </div>
        </Section>
      ) : null}

      {keys.size > 0 ? (
        <Section title="Navegação">
          {hasDpad ? (
            <div className="mx-auto grid w-full max-w-64 grid-cols-3 gap-2">
              <span aria-hidden />
              {keyButton('up', <ArrowUp aria-hidden className="size-6!" />)}
              <span aria-hidden />
              {keyButton('left', <ArrowLeft aria-hidden className="size-6!" />)}
              {keyButton('ok', null, undefined, 'OK')}
              {keyButton('right', <ArrowRight aria-hidden className="size-6!" />)}
              <span aria-hidden />
              {keyButton('down', <ArrowDown aria-hidden className="size-6!" />)}
              <span aria-hidden />
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            {keyButton('back', <Undo2 aria-hidden />, undefined, 'Voltar')}
            {keyButton('home', <Home aria-hidden />, undefined, 'Início')}
          </div>
        </Section>
      ) : null}

      {sources.length > 0 ? (
        <Section title="Entradas">
          <div className="grid grid-cols-2 gap-2">
            {sources.map((source) => (
              <Button
                key={source}
                variant={state.source === source ? 'default' : 'secondary'}
                aria-pressed={state.source === source}
                disabled={blocked}
                onClick={() => send('select_source', { source })}
              >
                {source}
              </Button>
            ))}
          </div>
        </Section>
      ) : null}

      {has('set_volume') || has('volume_up') || has('set_mute') || has('play') || has('pause') ? (
        <Section title="Mídia">
          {has('set_volume') ? (
            <LevelSlider
              label="Volume"
              value={state.volume}
              command="set_volume"
              param="level"
              onCommand={execute}
              disabled={blocked}
            />
          ) : null}
          {!has('set_volume') && has('volume_up') && has('volume_down') ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" disabled={blocked} onClick={() => send('volume_down')}>
                <Volume1 aria-hidden />
                Menos volume
              </Button>
              <Button variant="secondary" disabled={blocked} onClick={() => send('volume_up')}>
                <Volume2 aria-hidden />
                Mais volume
              </Button>
            </div>
          ) : null}
          {has('set_mute') ? (
            <PowerSwitch
              label="Mudo"
              checked={state.muted}
              onCommand={execute}
              disabled={blocked}
              commandFor={(next) => ({ command: 'set_mute', params: { muted: next } })}
            />
          ) : null}
          {has('play') || has('pause') ? (
            <div className="grid grid-cols-2 gap-2">
              {has('pause') ? (
                <Button variant="secondary" disabled={blocked} onClick={() => send('pause')}>
                  <Pause aria-hidden />
                  Pausar
                </Button>
              ) : null}
              {has('play') ? (
                <Button variant="secondary" disabled={blocked} onClick={() => send('play')}>
                  <Play aria-hidden />
                  Reproduzir
                </Button>
              ) : null}
            </div>
          ) : null}
        </Section>
      ) : null}

      {keys.size === 0 && apps.length === 0 ? (
        <Alert variant="warning">
          <AlertTitle>Sem controle remoto</AlertTitle>
          <AlertDescription>
            Esta TV não expõe teclas nem aplicativos. Veja docs/SAMSUNG_TV.md para associar o
            controle remoto do Home Assistant.
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
