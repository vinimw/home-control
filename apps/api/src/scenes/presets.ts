import type { Device, ScenePreset, ScenePresetKey, ScenePresetStep } from '@home-control/shared';

type Role = 'tv' | 'spotify' | 'echo';

interface TemplateStep {
  label: string;
  role: Role;
  command: string;
  params?: Record<string, unknown>;
}

interface Template {
  key: ScenePresetKey;
  name: string;
  description: string;
  steps: TemplateStep[];
}

/**
 * Starting points built only from what the connected TV, Echo and Spotify support. Nothing here controls
 * the Nova Digital bulb (deferred): when lights are supported they are added by editing the scene.
 * Installing creates an ordinary scene, so everything can be edited or removed afterwards.
 */
export const TEMPLATES: readonly Template[] = [
  {
    key: 'cinema',
    name: 'Cinema',
    description: 'Liga a TV e ajusta o volume.',
    steps: [
      { label: 'Ligar a TV', role: 'tv', command: 'turn_on' },
      { label: 'Volume da TV em 20%', role: 'tv', command: 'set_volume', params: { level: 20 } },
    ],
  },
  {
    key: 'good_night',
    name: 'Boa noite',
    description: 'Desliga a TV e pausa a música.',
    steps: [
      { label: 'Desligar a TV', role: 'tv', command: 'turn_off' },
      { label: 'Pausar o Spotify', role: 'spotify', command: 'pause' },
      { label: 'Pausar o Echo', role: 'echo', command: 'pause' },
    ],
  },
  {
    key: 'music',
    name: 'Música',
    description: 'Retoma o Spotify na saída ativa e ajusta o volume do Echo.',
    steps: [
      { label: 'Tocar no Spotify', role: 'spotify', command: 'play' },
      {
        label: 'Volume do Echo em 30%',
        role: 'echo',
        command: 'set_volume',
        params: { level: 30 },
      },
    ],
  },
];

const ROLE_LABEL: Record<Role, string> = { tv: 'a TV', spotify: 'o Spotify', echo: 'o Echo' };

function deviceFor(role: Role, devices: readonly Device[]): Device | undefined {
  const usable = devices.filter((d) => d.availability !== 'unavailable');
  if (role === 'tv') return usable.find((d) => d.type === 'tv');
  if (role === 'spotify') return usable.find((d) => /^spotify/i.test(d.sourceName));
  return usable.find((d) => d.type === 'speaker' && /echo/i.test(d.sourceName));
}

function resolveStep(step: TemplateStep, devices: readonly Device[]): ScenePresetStep {
  const device = deviceFor(step.role, devices);
  if (!device) {
    return {
      label: step.label,
      available: false,
      reason: `Não encontrei ${ROLE_LABEL[step.role]} disponível agora.`,
    };
  }
  if (!device.commands.some((command) => command.name === step.command)) {
    return {
      label: step.label,
      available: false,
      reason: `${device.name} não aceita este comando agora.`,
    };
  }
  return {
    label: step.label,
    available: true,
    step: {
      deviceId: device.id,
      command: step.command,
      ...(step.params ? { params: step.params } : {}),
    },
  };
}

export function resolvePreset(
  template: Template,
  devices: readonly Device[],
  installedNames: ReadonlySet<string>,
): ScenePreset {
  return {
    key: template.key,
    name: template.name,
    description: template.description,
    installed: installedNames.has(template.name.toLocaleLowerCase('pt-BR')),
    steps: template.steps.map((step) => resolveStep(step, devices)),
  };
}
