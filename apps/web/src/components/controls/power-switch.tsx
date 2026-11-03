'use client';

import { useId } from 'react';
import { Switch } from '@/components/ui/switch';
import { ControlStatus } from './control-status';
import { useControlDisabled } from './device-card';
import { useDeviceCommand, type ExecuteCommand } from './use-device-command';

interface PowerSwitchProps {
  label: string;
  /** The device's REAL reported state. `null` when unknown. The switch never moves on its own. */
  checked: boolean | null;
  onCommand: ExecuteCommand;
  disabled?: boolean;
  /** Command sent when toggled. Defaults to `turn_on` / `turn_off` (use it for e.g. `set_mute`). */
  commandFor?: (next: boolean) => { command: string; params?: Record<string, unknown> };
}

/**
 * On/off control. It is fully controlled: toggling sends the command and shows "Enviando…", but the
 * switch only changes when the parent passes the device's new reported state.
 */
export function PowerSwitch({ label, checked, onCommand, disabled, commandFor }: PowerSwitchProps) {
  const id = useId();
  const { state, run, pending } = useDeviceCommand(onCommand);
  const isDisabled = useControlDisabled(disabled) || pending;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {checked === null ? (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (estado desconhecido)
            </span>
          ) : null}
        </label>
        <Switch
          id={id}
          checked={checked === true}
          disabled={isDisabled}
          aria-busy={pending}
          onCheckedChange={(next) => {
            const { command, params } = commandFor
              ? commandFor(next)
              : { command: next ? 'turn_on' : 'turn_off', params: undefined };
            void run(command, params);
          }}
        />
      </div>
      <ControlStatus state={state} />
    </div>
  );
}
