'use client';

import { memo, useCallback, type ReactNode } from 'react';
import Link from 'next/link';
import { Mic, Pause, Play, Tv, Volume1, Volume2, Zap } from 'lucide-react';
import type { Device } from '@home-control/shared';
import {
  ActionButton,
  DeviceCard,
  LevelSlider,
  PowerSwitch,
  type ExecuteCommand,
} from '@/components/controls';
import { buttonVariants } from '@/components/ui/button';
import { FavoriteButton } from './favorite-button';

/** Commands that produce a control. A device with none of them is shown as a compact read-only row. */
const CONTROL_COMMANDS = new Set([
  'turn_on',
  'turn_off',
  'set_brightness',
  'set_volume',
  'volume_up',
  'volume_down',
  'set_mute',
  'play',
  'pause',
  'activate',
  'press_key',
  'launch_app',
]);

export function isControllable(device: Device): boolean {
  return device.commands.some((command) => CONTROL_COMMANDS.has(command.name));
}

const PLAYBACK_LABEL = { playing: 'Reproduzindo', paused: 'Pausado' } as const;

/** Read-only facts the device reports. Shown only when the device actually reported them. */
export function readings(device: Device): string[] {
  const { state } = device;
  const lines: string[] = [];
  if (state.reading) {
    lines.push(`${state.reading.value}${state.reading.unit ? ` ${state.reading.unit}` : ''}`);
  }
  if (state.temperature !== null) lines.push(`Temperatura: ${state.temperature}°`);
  if (state.targetTemperature !== null) lines.push(`Alvo: ${state.targetTemperature}°`);
  if (state.hvacMode) lines.push(`Modo: ${state.hvacMode}`);
  if (state.position !== null) lines.push(`Posição: ${state.position}%`);
  // `idle` says nothing useful (a TV that is simply on reports it), so only real playback is shown.
  if (state.playback === 'playing' || state.playback === 'paused') {
    lines.push(PLAYBACK_LABEL[state.playback]);
  }
  if (state.source) lines.push(`Fonte: ${state.source}`);
  return lines;
}

interface DeviceTileProps {
  device: Device;
  /** Sends a command to this device through the API. */
  onCommand: (
    deviceId: string,
    command: string,
    params?: Record<string, unknown>,
  ) => ReturnType<ExecuteCommand>;
  onToggleFavorite: (device: Device) => void;
}

/**
 * One device. Controls are built from the commands the device REALLY offers (`device.commands`), so a
 * control that the device cannot perform is never rendered.
 */
function DeviceTileImpl({ device, onCommand, onToggleFavorite }: DeviceTileProps) {
  const execute = useCallback<ExecuteCommand>(
    (command, params) => onCommand(device.id, command, params),
    [onCommand, device.id],
  );
  const has = (name: string) => device.commands.some((command) => command.name === name);
  const { state } = device;

  const canToggle = has('turn_on') && has('turn_off');
  const facts = readings(device);

  const buttons: ReactNode[] = [];
  const add = (key: string, label: string, command: string, icon?: ReactNode) =>
    buttons.push(
      <ActionButton
        key={key}
        className="min-w-[7rem] flex-1"
        label={label}
        icon={icon}
        command={command}
        onCommand={execute}
      />,
    );
  if (!canToggle && has('turn_on')) add('on', 'Ligar', 'turn_on');
  if (!canToggle && has('turn_off')) add('off', 'Desligar', 'turn_off');
  if (!has('set_volume') && has('volume_down') && has('volume_up')) {
    add('vol-', 'Menos volume', 'volume_down', <Volume1 aria-hidden />);
    add('vol+', 'Mais volume', 'volume_up', <Volume2 aria-hidden />);
  }
  if (has('pause') && state.playback === 'playing') {
    add('pause', 'Pausar', 'pause', <Pause aria-hidden />);
  } else if (has('play')) {
    add('play', 'Reproduzir', 'play', <Play aria-hidden />);
  }
  if (has('activate')) add('activate', 'Ativar', 'activate', <Zap aria-hidden />);

  return (
    <DeviceCard
      name={device.name}
      availability={device.availability}
      action={<FavoriteButton device={device} onToggle={onToggleFavorite} />}
    >
      {facts.length > 0 ? (
        <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>
      ) : null}

      {canToggle ? (
        <PowerSwitch
          label="Ligado"
          checked={state.power === null ? null : state.power === 'on'}
          onCommand={execute}
        />
      ) : null}

      {has('set_brightness') ? (
        <LevelSlider
          label="Brilho"
          value={state.brightness}
          command="set_brightness"
          param="level"
          onCommand={execute}
        />
      ) : null}

      {has('set_volume') ? (
        <LevelSlider
          label="Volume"
          value={state.volume}
          command="set_volume"
          param="level"
          onCommand={execute}
        />
      ) : null}

      {has('set_mute') ? (
        <PowerSwitch
          label="Mudo"
          checked={state.muted}
          onCommand={execute}
          commandFor={(next) => ({ command: 'set_mute', params: { muted: next } })}
        />
      ) : null}

      {has('press_key') || has('launch_app') ? (
        <Link href={`/devices/${device.id}`} className={buttonVariants({ variant: 'outline' })}>
          <Tv aria-hidden />
          Abrir controle remoto
        </Link>
      ) : null}

      {device.capabilities.includes('voice_command') ? (
        <Link href={`/echo?device=${device.id}`} className={buttonVariants({ variant: 'outline' })}>
          <Mic aria-hidden />
          Comandos da Alexa
        </Link>
      ) : null}

      {/* One-shot commands share a single wrapping row instead of one full-width button each. */}
      {buttons.length > 0 ? <div className="flex flex-wrap gap-2">{buttons}</div> : null}
    </DeviceCard>
  );
}

export const DeviceTile = memo(DeviceTileImpl);
