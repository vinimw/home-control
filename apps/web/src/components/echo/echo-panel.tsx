'use client';

import { useCallback, useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import {
  Pause,
  Pencil,
  Play,
  Send,
  SkipBack,
  SkipForward,
  Speaker,
  Trash2,
  Volume1,
  Volume2,
  WifiOff,
} from 'lucide-react';
import {
  ALEXA_NAME_MAX,
  ALEXA_TEXT_MAX,
  type AlexaCommand,
  type AlexaCommandListResponse,
  type Device,
  type DeviceListResponse,
} from '@home-control/shared';
import {
  AvailabilityIndicator,
  ControlStatus,
  LevelSlider,
  PowerSwitch,
  useDeviceCommand,
  type ExecuteCommand,
} from '@/components/controls';
import { useDevices } from '@/components/devices/use-devices';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  createAlexaCommand,
  deleteAlexaCommand,
  executeAlexaCommand,
  listAlexaCommands,
  testAlexaCommand,
  updateAlexaCommand,
  type AlexaResult,
} from '@/lib/alexa-client';
import { executeDeviceCommand } from '@/lib/devices-client';
import { cn } from '@/lib/utils';
import { AlexaStatus, type AlexaPhase } from './alexa-status';

const selectClass = cn(
  'flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

interface EchoPanelProps {
  initialDevices: DeviceListResponse | null;
  initialCommands: AlexaCommandListResponse | null;
  /** Echo preselected from the link on its card. */
  preferredDeviceId?: string;
}

export function EchoPanel({ initialDevices, initialCommands, preferredDeviceId }: EchoPanelProps) {
  const { devices, loaded, stale, apply, refresh } = useDevices(initialDevices);
  const echoes = useMemo(
    () => devices.filter((device) => device.capabilities.includes('voice_command')),
    [devices],
  );

  const [commands, setCommands] = useState<AlexaCommand[]>(initialCommands?.commands ?? []);
  const [commandsError, setCommandsError] = useState(initialCommands === null);
  const reloadCommands = useCallback(async () => {
    const result = await listAlexaCommands();
    if (result.ok) {
      setCommands(result.data.commands);
      setCommandsError(false);
    } else {
      setCommandsError(true);
    }
  }, []);
  useEffect(() => {
    if (initialCommands === null) void reloadCommands();
    // Runs once: `initialCommands` is only the starting value.
  }, []);

  const [pickedId, setPickedId] = useState(preferredDeviceId ?? '');
  const echo = echoes.find((device) => device.id === pickedId) ?? echoes[0];

  if (!echo) {
    return loaded ? (
      <EmptyState
        icon={Speaker}
        title="Nenhum Echo encontrado"
        description="Conecte a integração Alexa Devices no Home Assistant. Depois que o Echo aparecer lá, ele aparece aqui."
      />
    ) : (
      <EmptyState
        icon={WifiOff}
        title="Não foi possível carregar os dispositivos"
        description={stale ? 'O servidor não respondeu. Tente de novo.' : 'Carregando…'}
      >
        <Button onClick={() => void refresh()}>Tentar de novo</Button>
      </EmptyState>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
            {echo.name}
          </h1>
          <p className="text-xs text-muted-foreground">Comandos da Alexa e reprodução</p>
        </div>
        <AvailabilityIndicator availability={echo.availability} />
      </div>

      {echoes.length > 1 ? (
        <Field label="Echo">
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={echo.id}
              onChange={(event) => setPickedId(event.target.value)}
            >
              {echoes.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          )}
        </Field>
      ) : null}

      {echo.availability === 'unavailable' ? (
        <Alert variant="danger">
          <WifiOff aria-hidden />
          <div>
            <AlertTitle>Echo indisponível</AlertTitle>
            <AlertDescription>
              O Home Assistant não alcança este Echo. Os controles ficam desativados.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      <Playback device={echo} apply={apply} />

      <RunCommand
        commands={commands}
        echoes={echoes}
        error={commandsError}
        onReload={reloadCommands}
      />

      <ManageCommands
        commands={commands}
        echoes={echoes}
        defaultDeviceId={echo.id}
        onChanged={reloadCommands}
      />
    </div>
  );
}

// --- playback ----------------------------------------------------------------------------------------

function Playback({ device, apply }: { device: Device; apply: (device: Device) => void }) {
  const execute = useCallback<ExecuteCommand>(
    async (command, params) => {
      const result = await executeDeviceCommand(device.id, command, params);
      if (result.device) apply(result.device);
      return result;
    },
    [device.id, apply],
  );
  const { state: status, run } = useDeviceCommand(execute);
  const has = (name: string) => device.commands.some((command) => command.name === name);
  const blocked = device.availability === 'unavailable';
  const { state } = device;

  const buttons = [
    { command: 'previous_track', label: 'Anterior', icon: <SkipBack aria-hidden /> },
    { command: 'play', label: 'Reproduzir', icon: <Play aria-hidden /> },
    { command: 'pause', label: 'Pausar', icon: <Pause aria-hidden /> },
    { command: 'next_track', label: 'Próxima', icon: <SkipForward aria-hidden /> },
  ];
  const missing = buttons.filter((button) => !has(button.command)).map((button) => button.label);
  const hasVolume = has('set_volume') || (has('volume_up') && has('volume_down'));

  return (
    <Section
      title="Reprodução e volume"
      description="Só aparece o que o Echo informa que sabe fazer."
    >
      <ControlStatus state={status} />
      <div className="grid grid-cols-2 gap-2">
        {buttons
          .filter((button) => has(button.command))
          .map((button) => (
            <Button
              key={button.command}
              variant="secondary"
              disabled={blocked}
              onClick={() => void run(button.command)}
            >
              {button.icon}
              {button.label}
            </Button>
          ))}
      </div>
      {missing.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Indisponível neste Echo (o Home Assistant não oferece): {missing.join(', ')}.
        </p>
      ) : null}

      {has('set_volume') ? (
        <LevelSlider
          label="Volume"
          value={state.volume}
          command="set_volume"
          param="level"
          onCommand={execute}
          disabled={blocked}
        />
      ) : null}
      {!has('set_volume') && has('volume_up') && has('volume_down') ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={blocked} onClick={() => void run('volume_down')}>
            <Volume1 aria-hidden />
            Menos volume
          </Button>
          <Button variant="secondary" disabled={blocked} onClick={() => void run('volume_up')}>
            <Volume2 aria-hidden />
            Mais volume
          </Button>
        </div>
      ) : null}
      {!hasVolume ? (
        <p className="text-xs text-muted-foreground">
          Volume indisponível neste Echo (o Home Assistant não oferece).
        </p>
      ) : null}
      {has('set_mute') ? (
        <PowerSwitch
          label="Mudo"
          checked={state.muted}
          onCommand={execute}
          disabled={blocked}
          commandFor={(next) => ({ command: 'set_mute', params: { muted: next } })}
        />
      ) : null}
    </Section>
  );
}

// --- run a saved command -----------------------------------------------------------------------------

function RunCommand({
  commands,
  echoes,
  error,
  onReload,
}: {
  commands: AlexaCommand[];
  echoes: Device[];
  error: boolean;
  onReload: () => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [phase, setPhase] = useState<AlexaPhase>({ phase: 'idle' });
  // A deleted command can never stay selected.
  const selected = commands.find((command) => command.id === selectedId);
  const target = selected ? echoes.find((device) => device.id === selected.deviceId) : undefined;
  const targetDown = !target || target.availability === 'unavailable';
  const pending = phase.phase === 'pending';

  const run = async () => {
    if (!selected || pending) return;
    setPhase({ phase: 'pending' });
    const result = await executeAlexaCommand(selected.id);
    if (result.ok) setPhase({ phase: 'accepted' });
    else {
      setPhase({ phase: 'failed', message: result.message });
      if (result.code === 'not_found') void onReload();
    }
  };

  return (
    <Section
      title="Executar comando"
      description="Escolher um comando não envia nada. Só o botão abaixo envia."
    >
      {error ? (
        <Alert variant="danger">
          <AlertDescription>
            Não foi possível carregar os comandos salvos.{' '}
            <Button variant="outline" size="sm" onClick={() => void onReload()}>
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {commands.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">
          Você ainda não salvou nenhum comando. Crie o primeiro abaixo, em “Comandos salvos”.
        </p>
      ) : (
        <>
          <Field label="Comando salvo">
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={selected?.id ?? ''}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  setPhase({ phase: 'idle' });
                }}
              >
                <option value="">Escolha um comando…</option>
                {commands.map((command) => (
                  <option key={command.id} value={command.id}>
                    {command.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {selected ? (
            <dl className="rounded-md border bg-muted/40 p-3 text-sm">
              <dt className="text-xs text-muted-foreground">Texto enviado à Alexa</dt>
              <dd className="font-medium [overflow-wrap:anywhere]">“{selected.text}”</dd>
              <dt className="mt-2 text-xs text-muted-foreground">Echo</dt>
              <dd>{target?.name ?? 'Echo não encontrado'}</dd>
            </dl>
          ) : null}
          {selected && targetDown ? (
            <p className="text-sm text-destructive">
              {target
                ? 'O Echo deste comando está indisponível agora.'
                : 'O Echo deste comando não existe mais no Home Assistant. Edite o comando e escolha outro.'}
            </p>
          ) : null}
          <Button
            onClick={() => void run()}
            disabled={!selected || targetDown || pending}
            aria-busy={pending}
          >
            <Send aria-hidden />
            Executar comando
          </Button>
          <AlexaStatus state={phase} />
        </>
      )}
    </Section>
  );
}

// --- create, test, edit, delete ----------------------------------------------------------------------

function ManageCommands({
  commands,
  echoes,
  defaultDeviceId,
  onChanged,
}: {
  commands: AlexaCommand[];
  echoes: Device[];
  defaultDeviceId: string;
  onChanged: () => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [deviceId, setDeviceId] = useState(defaultDeviceId);
  const [test, setTest] = useState<AlexaPhase>({ phase: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<AlexaCommand | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const target = echoes.find((device) => device.id === deviceId);
  const textOk = text.trim().length > 0;
  const targetOk = target !== undefined && target.availability !== 'unavailable';
  const testing = test.phase === 'pending';

  const reset = () => {
    setEditingId(null);
    setName('');
    setText('');
    setDeviceId(defaultDeviceId);
    setTest({ phase: 'idle' });
    setSaveError(null);
  };

  const startEdit = (command: AlexaCommand) => {
    setEditingId(command.id);
    setName(command.name);
    setText(command.text);
    setDeviceId(command.deviceId);
    setTest({ phase: 'idle' });
    setSaveError(null);
    setSaved(null);
  };

  const runTest = async () => {
    if (!textOk || !targetOk || testing) return;
    setTest({ phase: 'pending' });
    const result = await testAlexaCommand(text.trim(), deviceId);
    // The draft stays exactly as typed, whatever happens.
    setTest(result.ok ? { phase: 'accepted' } : { phase: 'failed', message: result.message });
  };

  const save = async () => {
    if (!name.trim() || !textOk || !target || saving) return;
    setSaving(true);
    setSaveError(null);
    const input = { name: name.trim(), text: text.trim(), deviceId };
    const result: AlexaResult<AlexaCommand> = editingId
      ? await updateAlexaCommand(editingId, input)
      : await createAlexaCommand(input);
    setSaving(false);
    if (!result.ok) {
      // Keep the form so nothing typed is lost.
      setSaveError(result.message);
      if (result.code === 'not_found') void onChanged();
      return;
    }
    setSaved(`Comando “${result.data.name}” salvo. Nada foi enviado à Alexa.`);
    reset();
    await onChanged();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteAlexaCommand(toDelete.id);
    setDeleting(false);
    // A command that is already gone counts as deleted: the list is refreshed either way.
    if (result.ok || result.code === 'not_found') {
      if (editingId === toDelete.id) reset();
      setToDelete(null);
      await onChanged();
    } else {
      setDeleteError(result.message);
    }
  };

  return (
    <Section
      title="Comandos salvos"
      description="O texto é entendido pela Alexa como se você o tivesse falado. Escreva exatamente a frase que quer que ela execute, por exemplo “tocar Spotify”."
    >
      {saved ? (
        <Alert variant="info">
          <AlertDescription>{saved}</AlertDescription>
        </Alert>
      ) : null}

      <form
        className="flex flex-col gap-3 rounded-md border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <h3 className="text-sm font-semibold">{editingId ? 'Editar comando' : 'Novo comando'}</h3>
        <Field label="Nome">
          {(id) => (
            <Input
              id={id}
              value={name}
              maxLength={ALEXA_NAME_MAX}
              placeholder="Tocar Spotify"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Field label="Texto do comando" hint={`Até ${ALEXA_TEXT_MAX} caracteres.`}>
          {(id) => (
            <Input
              id={id}
              value={text}
              maxLength={ALEXA_TEXT_MAX}
              placeholder="tocar Spotify"
              onChange={(event) => {
                setText(event.target.value);
                setTest({ phase: 'idle' });
              }}
            />
          )}
        </Field>
        <Field label="Echo">
          {(id) => (
            <select
              id={id}
              className={selectClass}
              value={deviceId}
              onChange={(event) => {
                setDeviceId(event.target.value);
                setTest({ phase: 'idle' });
              }}
            >
              {echoes.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <p className="text-xs text-muted-foreground">
          “Testar comando” envia de verdade a frase ao Echo selecionado e pode causar efeitos reais
          (tocar, abrir, controlar outros aparelhos). Ele não salva nada.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void runTest()}
            disabled={!textOk || !targetOk || testing}
            aria-busy={testing}
          >
            Testar comando
          </Button>
          <Button
            type="submit"
            disabled={!name.trim() || !textOk || !target || saving}
            aria-busy={saving}
          >
            Salvar comando
          </Button>
        </div>
        {!targetOk && target ? (
          <p className="text-xs text-destructive">O Echo selecionado está indisponível.</p>
        ) : null}
        <AlexaStatus state={test} />
        {test.phase === 'accepted' ? (
          <p className="text-xs text-muted-foreground">
            O teste é só um aviso: salve se a Alexa fez o que você queria. Se não, ajuste o texto e
            teste de novo.
          </p>
        ) : null}
        {saveError ? (
          <Alert variant="danger">
            <AlertDescription>{saveError}</AlertDescription>
          </Alert>
        ) : null}
        {editingId ? (
          <Button type="button" variant="ghost" onClick={reset}>
            Cancelar edição
          </Button>
        ) : null}
      </form>

      {commands.length > 0 ? (
        <ul className="flex flex-col divide-y rounded-md border">
          {commands.map((command) => (
            <li key={command.id} className="flex items-center gap-2 py-1 pl-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium [overflow-wrap:anywhere]">{command.name}</p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  “{command.text}” ·{' '}
                  {echoes.find((device) => device.id === command.deviceId)?.name ??
                    'Echo não encontrado'}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Editar ${command.name}`}
                title="Editar"
                onClick={() => startEdit(command)}
              >
                <Pencil aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Excluir ${command.name}`}
                title="Excluir"
                onClick={() => {
                  setDeleteError(null);
                  setToDelete(command);
                }}
              >
                <Trash2 aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title={`Excluir o comando “${toDelete?.name ?? ''}”?`}
        description={
          <>
            O comando salvo será apagado. Isso não desfaz nada que a Alexa já tenha feito.
            {deleteError ? (
              <span className="mt-2 block text-destructive">{deleteError}</span>
            ) : null}
          </>
        }
        confirmLabel="Excluir"
        destructive
        pending={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      />
    </Section>
  );
}
