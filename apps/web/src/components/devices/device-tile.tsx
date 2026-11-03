'use client';

import { memo, useCallback } from 'react';
import { Pause, Play, Star, Volume1, Volume2, Zap } from 'lucide-react';
import type { Device } from '@home-control/shared';
import {
  ActionButton,
  DeviceCard,
  LevelSlider,
  PowerSwitch,
  type ExecuteCommand,
} from '@/components/controls';
import { cn } from '@/lib/utils';

const PLAYBACK_LABEL = { playing: 'Reproduzindo', paused: 'Pausado' } as const;

/** Read-only facts the device reports. Shown only when the device actually reported them. */
function readings(device: Device): string[] {
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

  return (
    <DeviceCard
      name={device.name}
      room={device.room?.name}
      availability={device.availability}
      action={
        <button
          type="button"
          onClick={() => onToggleFavorite(device)}
          aria-pressed={device.favorite}
          aria-label={
            device.favorite
              ? `Remover ${device.name} dos favoritos`
              : `Adicionar ${device.name} aos favoritos`
          }
          className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Star
            aria-hidden
            className={cn('size-5', device.favorite && 'fill-warning text-warning')}
          />
        </button>
      }
    >
      {facts.length > 0 ? (
        <p className="text-sm text-muted-foreground">{facts.join(' · ')}</p>
      ) : null}

      {canToggle ? (
        <PowerSwitch
          label="Ligado"
          checked={state.power === null ? null : state.power === 'on'}
          onCommand={execute}
        />
      ) : (
        <>
          {has('turn_on') ? (
            <ActionButton label="Ligar" command="turn_on" onCommand={execute} />
          ) : null}
          {has('turn_off') ? (
            <ActionButton label="Desligar" command="turn_off" onCommand={execute} />
          ) : null}
        </>
      )}

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
      {!has('set_volume') && has('volume_up') && has('volume_down') ? (
        <div className="grid grid-cols-2 gap-2">
          <ActionButton
            label="Menos volume"
            icon={<Volume1 aria-hidden />}
            command="volume_down"
            onCommand={execute}
          />
          <ActionButton
            label="Mais volume"
            icon={<Volume2 aria-hidden />}
            command="volume_up"
            onCommand={execute}
          />
        </div>
      ) : null}

      {has('set_mute') ? (
        <PowerSwitch
          label="Mudo"
          checked={state.muted}
          onCommand={execute}
          commandFor={(next) => ({ command: 'set_mute', params: { muted: next } })}
        />
      ) : null}

      {has('pause') && state.playback === 'playing' ? (
        <ActionButton
          label="Pausar"
          icon={<Pause aria-hidden />}
          command="pause"
          onCommand={execute}
        />
      ) : has('play') ? (
        <ActionButton
          label="Reproduzir"
          icon={<Play aria-hidden />}
          command="play"
          onCommand={execute}
        />
      ) : null}

      {has('activate') ? (
        <ActionButton
          label="Ativar"
          icon={<Zap aria-hidden />}
          command="activate"
          onCommand={execute}
        />
      ) : null}
    </DeviceCard>
  );
}

export const DeviceTile = memo(DeviceTileImpl);
