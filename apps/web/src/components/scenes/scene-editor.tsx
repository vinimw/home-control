'use client';

import { useId, useState } from 'react';
import { ArrowDown, ArrowUp, CircleAlert, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import {
  SCENE_NAME_MAX,
  SCENE_STEPS_MAX,
  type CommandParam,
  type Device,
  type Scene,
  type SceneInput,
  type SceneStep,
} from '@home-control/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { commandLabel } from './labels';

const SELECT =
  'flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50';

type ParamValue = string | number | boolean;

function defaultParams(params: CommandParam[]): Record<string, ParamValue> {
  return Object.fromEntries(
    params.map((p) => [
      p.name,
      p.type === 'number' ? (p.min ?? 0) : p.type === 'boolean' ? true : (p.options?.[0] ?? ''),
    ]),
  );
}

interface Props {
  scene: Scene | null;
  devices: Device[];
  pending: boolean;
  error: string | null;
  onSave: (input: SceneInput) => void;
  onCancel: () => void;
}

/** Editor for a scene: a name and ordered steps picked only from what each device supports right now. */
export function SceneEditor({ scene, devices, pending, error, onSave, onCancel }: Props) {
  const id = useId();
  const [name, setName] = useState(scene?.name ?? '');
  const [steps, setSteps] = useState<SceneStep[]>(scene?.steps ?? []);

  const byId = new Map(devices.map((d) => [d.id, d]));
  // Only devices that can do something now can start a new step.
  const pickable = devices.filter((d) => d.availability !== 'unavailable' && d.commands.length > 0);

  const patch = (index: number, change: SceneStep) =>
    setSteps((current) => current.map((s, i) => (i === index ? change : s)));
  const move = (index: number, by: -1 | 1) =>
    setSteps((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  const addStep = () => {
    const device = pickable[0];
    const command = device?.commands[0];
    if (!device || !command) return;
    setSteps((current) => [
      ...current,
      {
        deviceId: device.id,
        command: command.name,
        ...(command.params.length ? { params: defaultParams(command.params) } : {}),
      },
    ]);
  };

  const broken = steps.some((step) => {
    const device = byId.get(step.deviceId);
    return (
      !device ||
      device.availability === 'unavailable' ||
      !device.commands.some((c) => c.name === step.command)
    );
  });
  const canSave = name.trim().length > 0 && steps.length > 0 && !broken && !pending;

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSave({ name: name.trim(), steps });
      }}
    >
      <h2 className="text-base font-semibold">{scene ? 'Editar cena' : 'Nova cena'}</h2>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-name`} className="text-sm font-medium">
          Nome
        </label>
        <Input
          id={`${id}-name`}
          value={name}
          maxLength={SCENE_NAME_MAX}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <ol className="flex flex-col gap-3" aria-label="Passos">
        {steps.map((step, index) => {
          const device = byId.get(step.deviceId);
          const command = device?.commands.find((c) => c.name === step.command);
          const unavailable = !device || device.availability === 'unavailable' || !command;
          return (
            <li key={index} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Passo {index + 1}</span>
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir passo ${index + 1}`}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer passo ${index + 1}`}
                    disabled={index === steps.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover passo ${index + 1}`}
                    onClick={() => setSteps((c) => c.filter((_, i) => i !== index))}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </div>
              {unavailable ? (
                <p className="flex items-start gap-1.5 text-sm" role="alert">
                  <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                  {!device
                    ? 'Este dispositivo não existe mais.'
                    : device.availability === 'unavailable'
                      ? `${device.name} está indisponível agora.`
                      : `${device.name} não aceita "${commandLabel(step.command)}" agora.`}{' '}
                  Troque ou remova o passo para salvar.
                </p>
              ) : null}
              <select
                className={SELECT}
                aria-label={`Dispositivo do passo ${index + 1}`}
                value={step.deviceId}
                onChange={(event) => {
                  const next = byId.get(event.target.value);
                  const first = next?.commands[0];
                  if (!next || !first) return;
                  patch(index, {
                    deviceId: next.id,
                    command: first.name,
                    ...(first.params.length ? { params: defaultParams(first.params) } : {}),
                  });
                }}
              >
                {!device ? <option value={step.deviceId}>(dispositivo removido)</option> : null}
                {device && !pickable.includes(device) ? (
                  <option value={device.id}>{device.name} (indisponível)</option>
                ) : null}
                {pickable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                className={SELECT}
                aria-label={`Ação do passo ${index + 1}`}
                value={step.command}
                disabled={!device}
                onChange={(event) => {
                  const next = device?.commands.find((c) => c.name === event.target.value);
                  if (!device || !next) return;
                  patch(index, {
                    deviceId: device.id,
                    command: next.name,
                    ...(next.params.length ? { params: defaultParams(next.params) } : {}),
                  });
                }}
              >
                {!command ? (
                  <option value={step.command}>{commandLabel(step.command)} (indisponível)</option>
                ) : null}
                {device?.commands.map((c) => (
                  <option key={c.name} value={c.name}>
                    {commandLabel(c.name)}
                  </option>
                ))}
              </select>
              {command?.params.map((param) => {
                const value = step.params?.[param.name];
                const set = (v: ParamValue) =>
                  patch(index, { ...step, params: { ...step.params, [param.name]: v } });
                const label = `${param.name} do passo ${index + 1}`;
                return param.type === 'number' ? (
                  <Input
                    key={param.name}
                    type="number"
                    aria-label={label}
                    min={param.min}
                    max={param.max}
                    value={typeof value === 'number' ? value : ''}
                    onChange={(event) => set(Number(event.target.value))}
                  />
                ) : param.type === 'boolean' ? (
                  <select
                    key={param.name}
                    className={SELECT}
                    aria-label={label}
                    value={String(value ?? true)}
                    onChange={(event) => set(event.target.value === 'true')}
                  >
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                ) : param.options?.length ? (
                  <select
                    key={param.name}
                    className={SELECT}
                    aria-label={label}
                    value={String(value ?? '')}
                    onChange={(event) => set(event.target.value)}
                  >
                    {param.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    key={param.name}
                    aria-label={label}
                    value={String(value ?? '')}
                    onChange={(event) => set(event.target.value)}
                  />
                );
              })}
            </li>
          );
        })}
      </ol>

      <Button
        type="button"
        variant="outline"
        className="self-start"
        onClick={addStep}
        disabled={steps.length >= SCENE_STEPS_MAX || pickable.length === 0}
      >
        <Plus aria-hidden />
        Adicionar passo
      </Button>
      {pickable.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum dispositivo disponível agora para adicionar passos.
        </p>
      ) : null}
      {error ? (
        <p className="flex items-start gap-1.5 text-sm" role="alert">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={!canSave} aria-busy={pending}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          Salvar
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
