'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, Clapperboard, LoaderCircle, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { Device, Scene, ScenePreset, SceneInput, SceneRun } from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchDevices } from '@/lib/devices-client';
import {
  createScene,
  deleteScene,
  installScenePreset,
  listScenePresets,
  listScenes,
  runScene,
  updateScene,
} from '@/lib/scenes-client';
import { SceneEditor } from './scene-editor';
import { RUN_STATUS, STEP_STATUS, describeStep } from './labels';

type Editing = { scene: Scene | null } | null;

/** Scenes: list, create/edit, run and review the last result, each step reported separately. */
export function ScenesPanel() {
  const [scenes, setScenes] = useState<Scene[] | null>(null);
  const [presets, setPresets] = useState<ScenePreset[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<Scene | null>(null);

  const load = useCallback(async () => {
    const [list, presetList, deviceList] = await Promise.all([
      listScenes(),
      listScenePresets(),
      fetchDevices().catch(() => null),
    ]);
    if (list.ok) {
      setScenes(list.data.scenes);
      setError(null);
    } else {
      setError(list.message);
      setScenes((current) => current ?? []);
    }
    if (presetList.ok) setPresets(presetList.data.presets);
    if (deviceList) setDevices(deviceList.devices);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const deviceName = (id: string) =>
    devices.find((d) => d.id === id)?.name ?? 'Dispositivo removido';

  async function save(input: SceneInput) {
    setSaving(true);
    setEditorError(null);
    const existing = editing?.scene;
    const result = existing ? await updateScene(existing.id, input) : await createScene(input);
    setSaving(false);
    if (!result.ok) return setEditorError(result.message);
    setEditing(null);
    setNotice(existing ? 'Cena salva.' : 'Cena criada.');
    await load();
  }

  async function run(scene: Scene) {
    setRunningId(scene.id);
    setNotice(null);
    setError(null);
    const result = await runScene(scene.id);
    setRunningId(null);
    if (!result.ok) setError(result.message);
    await load();
  }

  async function install(preset: ScenePreset) {
    setError(null);
    const result = await installScenePreset(preset.key);
    if (!result.ok) return setError(result.message);
    setNotice(
      result.data.omitted.length
        ? `"${preset.name}" criada sem ${result.data.omitted.length} passo(s) indisponível(is).`
        : `"${preset.name}" criada.`,
    );
    await load();
  }

  async function remove() {
    if (!toDelete) return;
    const result = await deleteScene(toDelete.id);
    setToDelete(null);
    if (!result.ok) setError(result.message);
    await load();
  }

  if (scenes === null) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        Carregando cenas…
      </p>
    );
  }

  const available = presets.filter((p) => !p.installed);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Cenas</h1>
        {editing ? null : (
          <Button
            onClick={() => {
              setEditorError(null);
              setEditing({ scene: null });
            }}
          >
            <Plus aria-hidden />
            Nova cena
          </Button>
        )}
      </div>

      {error ? (
        <Alert variant="danger">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {editing ? (
        <SceneEditor
          key={editing.scene?.id ?? 'new'}
          scene={editing.scene}
          devices={devices}
          pending={saving}
          error={editorError}
          onSave={(input) => void save(input)}
          onCancel={() => setEditing(null)}
        />
      ) : null}

      {scenes.length === 0 && !editing ? (
        <EmptyState
          icon={Clapperboard}
          title="Nenhuma cena ainda"
          description="Crie uma cena ou comece por um modelo abaixo."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {scenes.map((scene) => {
            const last = scene.lastRun;
            return (
              <li key={scene.id} className="flex flex-col gap-2 rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">{scene.name}</p>
                    <p className="text-xs text-muted-foreground">{scene.steps.length} passo(s)</p>
                  </div>
                  {last ? (
                    <Badge variant={RUN_STATUS[last.status].variant}>
                      {RUN_STATUS[last.status].label}
                    </Badge>
                  ) : (
                    <Badge variant="muted">Nunca executada</Badge>
                  )}
                </div>
                <ol className="list-decimal pl-5 text-sm">
                  {scene.steps.map((step, i) => (
                    <li key={i} className="[overflow-wrap:anywhere]">
                      {describeStep(step, deviceName)}
                      {last?.steps[i] ? (
                        <>
                          {' '}
                          <Badge variant={STEP_STATUS[last.steps[i]!.status].variant}>
                            {STEP_STATUS[last.steps[i]!.status].label}
                          </Badge>
                          {last.steps[i]!.error ? (
                            <span className="block text-xs text-muted-foreground">
                              {last.steps[i]!.error!.message}
                            </span>
                          ) : null}
                        </>
                      ) : null}
                    </li>
                  ))}
                </ol>
                {last ? <LastRun run={last} /> : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => void run(scene)}
                    disabled={runningId !== null}
                    aria-busy={runningId === scene.id}
                  >
                    {runningId === scene.id ? (
                      <LoaderCircle aria-hidden className="animate-spin" />
                    ) : (
                      <Play aria-hidden />
                    )}
                    {runningId === scene.id ? 'Executando…' : 'Executar'}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={runningId !== null}
                    onClick={() => {
                      setEditorError(null);
                      setEditing({ scene });
                    }}
                  >
                    <Pencil aria-hidden />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    aria-label={`Excluir ${scene.name}`}
                    disabled={runningId !== null}
                    onClick={() => setToDelete(scene)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {available.length > 0 && !editing ? (
        <section aria-label="Modelos" className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Modelos
          </h2>
          <ul className="divide-y rounded-md border">
            {available.map((preset) => {
              const usable = preset.steps.filter((s) => s.available).length;
              return (
                <li key={preset.key} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{preset.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {preset.description} {usable}/{preset.steps.length} passos disponíveis agora.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={usable === 0}
                    onClick={() => void install(preset)}
                  >
                    Criar
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        destructive
        title="Excluir a cena?"
        description={`A cena "${toDelete?.name ?? ''}" será removida. Os dispositivos não mudam.`}
        confirmLabel="Excluir"
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function LastRun({ run }: { run: SceneRun }) {
  return (
    <p className="text-xs text-muted-foreground">
      Última execução: {new Date(run.at).toLocaleString('pt-BR')}. {RUN_STATUS[run.status].text}
    </p>
  );
}
