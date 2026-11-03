import type { DeviceState } from '@home-control/shared';

type Params = Record<string, unknown>;
export type Expectation = (state: DeviceState) => boolean;

const near = (actual: number | null, expected: number, tolerance: number): boolean =>
  actual !== null && Math.abs(actual - expected) <= tolerance;

/**
 * What the device state must look like for us to call a command `confirmed`.
 * `null` means the effect cannot be verified from state (relative or fire-and-forget commands), so the
 * result stays `accepted`.
 */
export function expectationFor(command: string, params: Params): Expectation | null {
  switch (command) {
    case 'turn_on':
      return (s) => s.power === 'on';
    case 'turn_off':
      return (s) => s.power === 'off';
    case 'set_brightness': {
      const level = Number(params.level);
      // Brightness 0 turns the light off; brightness is stored 0-255 so allow rounding error.
      return level === 0 ? (s) => s.power === 'off' : (s) => near(s.brightness, level, 1);
    }
    case 'set_volume':
      return (s) => near(s.volume, Number(params.level), 1);
    case 'set_mute':
      return (s) => s.muted === params.muted;
    case 'select_source':
      return (s) => s.source === params.source;
    case 'play':
      return (s) => s.playback === 'playing';
    case 'pause':
      return (s) => s.playback === 'paused';
    case 'stop':
      return (s) => s.playback === 'idle' || s.power === 'off';
    case 'set_temperature':
      return (s) => near(s.targetTemperature, Number(params.temperature), 0.5);
    case 'set_hvac_mode':
      return (s) => s.hvacMode === params.mode;
    case 'set_position':
      return (s) => near(s.position, Number(params.position), 2);
    default:
      return null;
  }
}
