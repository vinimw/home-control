'use client';

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ControlStatus } from './control-status';
import { useControlDisabled } from './device-card';
import { useDeviceCommand, type ExecuteCommand } from './use-device-command';

interface ActionButtonProps {
  label: string;
  command: string;
  params?: Record<string, unknown>;
  onCommand: ExecuteCommand;
  icon?: ReactNode;
  variant?: 'default' | 'secondary' | 'outline';
  disabled?: boolean;
}

/** One-shot command (activate a scene, play/pause, volume step) with the same honest status line. */
export function ActionButton({
  label,
  command,
  params,
  onCommand,
  icon,
  variant = 'secondary',
  disabled,
}: ActionButtonProps) {
  const { state, run, pending } = useDeviceCommand(onCommand);
  const isDisabled = useControlDisabled(disabled) || pending;

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        variant={variant}
        disabled={isDisabled}
        aria-busy={pending}
        onClick={() => void run(command, params)}
      >
        {icon}
        {label}
      </Button>
      <ControlStatus state={state} />
    </div>
  );
}
