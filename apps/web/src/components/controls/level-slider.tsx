'use client';

import { useState } from 'react';
import { Slider } from '@/components/ui/slider';
import { ControlStatus } from './control-status';
import { useControlDisabled } from './device-card';
import { useDeviceCommand, type ExecuteCommand } from './use-device-command';

interface LevelSliderProps {
  label: string;
  /** The device's REAL reported level (0-100). `null` when unknown. */
  value: number | null;
  /** Canonical command and param name, e.g. `set_volume` / `level`. */
  command: string;
  param: string;
  onCommand: ExecuteCommand;
  unit?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * Level control (volume, brightness...). While dragging it shows the draft value; the command is sent
 * once, on release. Afterwards the slider returns to the device's reported value, so a command that
 * was not confirmed never leaves the UI showing a level the device does not have.
 */
export function LevelSlider({
  label,
  value,
  command,
  param,
  onCommand,
  unit = '%',
  min = 0,
  max = 100,
  disabled,
}: LevelSliderProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const { state, run, pending } = useDeviceCommand(onCommand);
  const isDisabled = useControlDisabled(disabled) || value === null || pending;
  const shown = draft ?? value ?? min;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {value === null && draft === null ? '—' : `${shown}${unit}`}
        </span>
      </div>
      <Slider
        aria-label={label}
        min={min}
        max={max}
        step={1}
        value={[shown]}
        disabled={isDisabled}
        onValueChange={([next]) => setDraft(next ?? null)}
        onValueCommit={([next]) => {
          if (next === undefined) return;
          void run(command, { [param]: next }).finally(() => setDraft(null));
        }}
      />
      <ControlStatus state={state} />
    </div>
  );
}
