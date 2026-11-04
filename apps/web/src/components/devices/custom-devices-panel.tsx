'use client';

import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { CircleAlert, Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  CUSTOM_DEVICE_NAME_MAX,
  type AlexaCommand,
  type CustomDevice,
  type CustomDeviceInput,
  type Room,
} from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { listAlexaCommands } from '@/lib/alexa-client';
import {
  createCustomDevice,
  createRoom,
  deleteCustomDevice,
  listCustomDevices,
  listRooms,
  updateCustomDevice,
} from '@/lib/custom-devices-client';
import { cn } from '@/lib/utils';

const selectClass = cn(
  'flex h-11 w-full rounded-md border border-input bg-background px-3 text-base md:text-sm',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
);

const NEW_ROOM = '__new__';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
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

export interface EchoOption {
  id: string;
  name: string;
}

interface Props {
  initialDevices: CustomDevice[] | null;
  initialCommands: AlexaCommand[] | null;
  initialRooms: Room[] | null;
  echoes: EchoOption[];
  /** Card to open for editing, from the link on its tile. */
  editId?: string;
}

interface Draft {
  name: string;
  roomChoice: string; // '' = no room, a room id, or NEW_ROOM
  newRoom: string;
  favorite: boolean;
  onCommandId: string;
  offCommandId: string;
}

const EMPTY: Draft = {
  name: '',
  roomChoice: '',
  newRoom: '',
  favorite: false,
  onCommandId: '',
  offCommandId: '',
};

const draftOf = (device: CustomDevice): Draft => ({
  name: device.name,
  roomChoice: device.room?.id ?? '',
  newRoom: '',
  favorite: device.favorite,
  onCommandId: device.on.commandId ?? '',
  offCommandId: device.off.commandId ?? '',
});

export function CustomDevicesPanel({
  initialDevices,
  initialCommands,
  initialRooms,
  echoes,
  editId,
}: Props) {
  const [devices, setDevices] = useState<CustomDevice[]>(initialDevices ?? []);
  const [commands, setCommands] = useState<AlexaCommand[]>(initialCommands ?? []);
  const [rooms, setRooms] = useState<Room[]>(initialRooms ?? []);
  const [loadError, setLoadError] = useState(
    initialDevices === null || initialCommands === null || initialRooms === null,
  );

  const reload = useCallback(async () => {
    const [d, c, r] = await Promise.all([listCustomDevices(), listAlexaCommands(), listRooms()]);
    if (d.ok) setDevices(d.data.devices);
    if (c.ok) setCommands(c.data.commands);
    if (r.ok) setRooms(r.data.rooms);
    setLoadError(!(d.ok && c.ok && r.ok));
  }, []);
  useEffect(() => {
    if (initialDevices === null || initialCommands === null || initialRooms === null) {
      void reload();
    }
    // Runs once: the `initial*` props are only starting values.
  }, []);

  // `editing`: null = form closed, 'new' = creating, otherwise the id of the card being edited.
  const [editing, setEditing] = useState<string | 'new' | null>(
    editId && initialDevices?.some((device) => device.id === editId) ? editId : null,
  );
  const [draft, setDraft] = useState<Draft>(() => {
    const target = initialDevices?.find((device) => device.id === editId);
    return target ? draftOf(target) : EMPTY;
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<CustomDevice | null>(null);
  const [deleting, setDeleting] = useState(false);

  const open = (device: CustomDevice | null) => {
    setMessage(null);
    setEditing(device ? device.id : 'new');
    setDraft(device ? draftOf(device) : EMPTY);
  };
  const close = () => {
    setEditing(null);
    setMessage(null);
  };

  const echoName = (deviceId: string) =>
    echoes.find((echo) => echo.id === deviceId)?.name ?? 'Echo não encontrado';
  const commandLabel = (command: AlexaCommand) => `${command.name} · ${echoName(command.deviceId)}`;
  const commandById = (id: string) => commands.find((command) => command.id === id);

  const save = async () => {
    if (saving) return;
    const name = draft.name.trim();
    if (!name) {
      setMessage('Dê um nome ao cartão.');
      return;
    }
    setSaving(true);
    setMessage(null);

    // A new room is created first (or an existing one with the same name is reused).
    let roomId: string | null = draft.roomChoice === '' ? null : draft.roomChoice;
    if (draft.roomChoice === NEW_ROOM) {
      const wanted = draft.newRoom.trim();
      if (!wanted) {
        setSaving(false);
        setMessage('Digite o nome do novo cômodo.');
        return;
      }
      const existing = rooms.find(
        (room) => room.name.toLocaleLowerCase('pt-BR') === wanted.toLocaleLowerCase('pt-BR'),
      );
      if (existing) roomId = existing.id;
      else {
        const created = await createRoom(wanted);
        if (!created.ok) {
          setSaving(false);
          setMessage('Não foi possível criar o cômodo. O cartão não foi salvo.');
          return;
        }
        roomId = created.data.id;
        setRooms((current) => [...current, created.data]);
      }
    }

    const input: CustomDeviceInput = {
      name,
      roomId,
      favorite: draft.favorite,
      onCommandId: draft.onCommandId || null,
      offCommandId: draft.offCommandId || null,
    };
    // Saving stores the mapping only; nothing is sent to Alexa.
    const result =
      editing === 'new'
        ? await createCustomDevice(input)
        : await updateCustomDevice(editing as string, input);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      if (result.code === 'not_found') {
        void reload();
        setEditing(null);
      }
      return;
    }
    await reload();
    setEditing(null);
  };

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    const result = await deleteCustomDevice(toDelete.id);
    setDeleting(false);
    // "Not found" means it is already gone: the goal is reached either way.
    if (result.ok || result.code === 'not_found') {
      setToDelete(null);
      if (editing === toDelete.id) setEditing(null);
      await reload();
    } else {
      setToDelete(null);
      setMessage(result.message);
    }
  };

  const form = editing ? (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">
          {editing === 'new' ? 'Novo cartão' : 'Editar cartão'}
        </CardTitle>
        <CardDescription>
          Salvar só guarda a configuração. Nada é enviado à Alexa até você tocar em Ligar ou
          Desligar no painel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Field label="Nome">
            {(id) => (
              <Input
                id={id}
                value={draft.name}
                maxLength={CUSTOM_DEVICE_NAME_MAX}
                autoComplete="off"
                placeholder="Ex.: Luminária"
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            )}
          </Field>

          <Field label="Cômodo">
            {(id) => (
              <select
                id={id}
                className={selectClass}
                value={draft.roomChoice}
                onChange={(event) => setDraft({ ...draft, roomChoice: event.target.value })}
              >
                <option value="">Sem cômodo</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
                <option value={NEW_ROOM}>Novo cômodo…</option>
              </select>
            )}
          </Field>
          {draft.roomChoice === NEW_ROOM ? (
            <Field label="Nome do novo cômodo">
              {(id) => (
                <Input
                  id={id}
                  value={draft.newRoom}
                  maxLength={40}
                  autoComplete="off"
                  onChange={(event) => setDraft({ ...draft, newRoom: event.target.value })}
                />
              )}
            </Field>
          ) : null}

          {(
            [
              ['onCommandId', 'Comando para Ligar'],
              ['offCommandId', 'Comando para Desligar'],
            ] as const
          ).map(([key, label]) => {
            const picked = draft[key] ? commandById(draft[key]) : undefined;
            const gone = Boolean(draft[key]) && !picked;
            return (
              <Field
                key={key}
                label={label}
                hint={
                  gone
                    ? 'O comando salvo escolhido antes foi excluído. Escolha outro.'
                    : picked
                      ? `Vai dizer à Alexa: “${picked.text}”`
                      : undefined
                }
              >
                {(id) => (
                  <select
                    id={id}
                    className={selectClass}
                    value={draft[key]}
                    onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                  >
                    <option value="">Nenhum</option>
                    {gone ? <option value={draft[key]}>(comando excluído)</option> : null}
                    {commands.map((command) => (
                      <option key={command.id} value={command.id}>
                        {commandLabel(command)}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            );
          })}
          {commands.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Ainda não há comandos salvos. Crie na página{' '}
              <Link href="/echo" className="underline underline-offset-2">
                Echo
              </Link>{' '}
              e volte aqui.
            </p>
          ) : null}

          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={draft.favorite}
              onChange={(event) => setDraft({ ...draft, favorite: event.target.checked })}
            />
            Favorito
          </label>

          <p role="status" aria-live="polite" className="text-sm empty:hidden">
            {message ? (
              <span className="flex items-start gap-1.5">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
                {message}
              </span>
            ) : null}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar cartão'}
            </Button>
            <Button type="button" variant="outline" onClick={close} disabled={saving}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">Cartões personalizados</h1>
          <p className="text-xs text-muted-foreground">
            Luzes controladas pela Alexa, com um comando para Ligar e outro para Desligar.
          </p>
        </div>
        {!editing ? (
          <Button onClick={() => open(null)}>
            <Plus aria-hidden />
            Novo cartão
          </Button>
        ) : null}
      </div>

      {loadError ? (
        <Alert variant="danger">
          <CircleAlert aria-hidden />
          <AlertDescription>
            Não foi possível carregar tudo do servidor. O que aparece pode estar incompleto.{' '}
            <button type="button" className="underline" onClick={() => void reload()}>
              Tentar de novo
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {!editing && message ? (
        <Alert variant="danger">
          <CircleAlert aria-hidden />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {form}

      {devices.length === 0 && !editing ? (
        <EmptyState
          icon={Lightbulb}
          title="Nenhum cartão ainda"
          description="Crie um cartão, escolha um nome e os comandos salvos da Alexa para Ligar e Desligar."
        />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Cartões">
          {devices.map((device) => (
            <li key={device.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-2 pt-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]">{device.name}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {device.room?.name ?? 'Sem cômodo'}
                      {device.favorite ? ' · Favorito' : ''}
                    </p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      Ligar: {device.on.commandName ?? statusText(device.on.status)} · Desligar:{' '}
                      {device.off.commandName ?? statusText(device.off.status)}
                    </p>
                  </div>
                  <div className="-mr-2 flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Editar ${device.name}`}
                      title="Editar"
                      onClick={() => open(device)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Excluir ${device.name}`}
                      title="Excluir"
                      onClick={() => setToDelete(device)}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Link href="/devices" className={buttonVariants({ variant: 'outline' })}>
        Voltar para Dispositivos
      </Link>

      <ConfirmDialog
        open={toDelete !== null}
        title="Excluir cartão?"
        description={
          <>
            O cartão <strong>{toDelete?.name}</strong> sai da página Dispositivos. Os comandos
            salvos da Alexa continuam existindo. Nada é enviado à Alexa.
          </>
        }
        confirmLabel="Excluir cartão"
        destructive
        pending={deleting}
        onConfirm={() => void remove()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function statusText(status: CustomDevice['on']['status']): string {
  switch (status) {
    case 'unset':
      return 'sem comando';
    case 'missing_command':
      return 'comando excluído';
    default:
      return 'comando salvo';
  }
}
