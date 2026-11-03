'use client';

import type { DeviceActionResult } from '@home-control/shared';
import { DeviceCard, LevelSlider, PowerSwitch } from '@/components/controls';

/**
 * Demo executor: there is no device behind this page, so every command FAILS on purpose.
 * Showing a believable success here would teach the wrong thing about how real controls behave.
 */
const demoExecute = async (command: string): Promise<DeviceActionResult> => {
  await new Promise((resolve) => setTimeout(resolve, 700));
  return {
    status: 'failed',
    deviceId: 'demo',
    command,
    requestId: null,
    replayed: false,
    error: { code: 'not_configured', message: 'Demonstração' },
    device: null,
  };
};

export function ControlDemos() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <DeviceCard name="TV da sala (exemplo)" room="Sala" availability="available">
        <PowerSwitch label="Ligar" checked={true} onCommand={demoExecute} />
        <LevelSlider
          label="Volume"
          value={25}
          command="set_volume"
          param="level"
          onCommand={demoExecute}
        />
      </DeviceCard>
      <DeviceCard name="Luminária (exemplo)" room="Quarto" availability="unavailable">
        <PowerSwitch label="Ligar" checked={null} onCommand={demoExecute} />
        <LevelSlider
          label="Brilho"
          value={null}
          command="set_brightness"
          param="level"
          onCommand={demoExecute}
        />
      </DeviceCard>
      <DeviceCard name="Sensor (exemplo)" room={null} availability="unknown">
        <PowerSwitch label="Ligar" checked={null} onCommand={demoExecute} />
      </DeviceCard>
    </div>
  );
}
