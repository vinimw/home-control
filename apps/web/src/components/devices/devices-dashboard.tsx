'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CircleAlert, LayoutGrid, Lightbulb, RefreshCw, SearchX, WifiOff } from 'lucide-react';
import type {
  CustomDevice,
  CustomDeviceListResponse,
  Device,
  DeviceListResponse,
  DeviceLayout,
  Room,
} from '@home-control/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  createRoom,
  listRooms,
  listCustomDevices,
  updateCustomDevice,
} from '@/lib/custom-devices-client';
import { executeDeviceCommand, updateDeviceSettings } from '@/lib/devices-client';
import { cn } from '@/lib/utils';
import { CATEGORIES, categoryOf, NO_ROOM_LABEL, type CategoryId } from './categories';
import { CustomDeviceTile } from './custom-device-tile';
import { DeviceRow } from './device-row';
import { DeviceTile, isControllable } from './device-tile';
import { useDevices, type Connection } from './use-devices';
import { OrderingGrid } from './ordering-grid';
import { moveVisibleCard, useDeviceLayout } from './use-device-layout';

const CONNECTION_BADGE: Record<
  Connection,
  { label: string; variant: 'success' | 'warning' | 'muted' }
> = {
  live: { label: 'Ao vivo', variant: 'success' },
  connecting: { label: 'Conectando…', variant: 'muted' },
  reconnecting: { label: 'Reconectando…', variant: 'warning' },
};

type Filter = 'all' | 'favorites' | CategoryId;

const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'medium' });

function groupByRoom<T extends { name: string; room: { name: string } | null }>(
  items: T[],
): Array<{ room: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.room?.name ?? NO_ROOM_LABEL;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === NO_ROOM_LABEL ? 1 : b === NO_ROOM_LABEL ? -1 : a.localeCompare(b, 'pt-BR'),
    )
    .map(([room, list]) => ({
      room,
      items: list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }));
}

/** A card configured by the user (a light controlled through Alexa) always belongs to this category. */
const CUSTOM_CATEGORY: CategoryId = 'lights';

type Entry =
  | { kind: 'device'; name: string; room: Device['room']; device: Device }
  | { kind: 'custom'; name: string; room: CustomDevice['room']; custom: CustomDevice };

export function DevicesDashboard({
  initial,
  initialCustom = null,
  initialLayout = null,
  initialRooms = null,
}: {
  initial: DeviceListResponse | null;
  initialCustom?: CustomDeviceListResponse | null;
  initialLayout?: DeviceLayout | null;
  initialRooms?: Room[] | null;
}) {
  const view = useDevices(initial);
  const ordering = useDeviceLayout(initialLayout);
  const [editing, setEditing] = useState(false);
  const [moveNotice, setMoveNotice] = useState('');
  const [savedRooms, setSavedRooms] = useState<Room[]>(initialRooms ?? []);
  const [roomName, setRoomName] = useState('');
  const [roomError, setRoomError] = useState<string | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [dropRoom, setDropRoom] = useState<string | null>(null);
  useEffect(() => {
    if (initialRooms === null)
      void listRooms().then((result) => {
        if (result.ok) setSavedRooms(result.data.rooms);
        else
          setRoomError(
            'Não foi possível carregar os cômodos. Recarregue a página para tentar novamente.',
          );
      });
  }, [initialRooms]);
  const { devices, summary, loaded, stale, connection, updatedAt, refreshing, refresh, apply } =
    view;
  const [filter, setFilter] = useState<Filter>('all');
  const [roomId, setRoomId] = useState<string>('all');
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

  // Custom cards are not part of the live Home Assistant stream: they are re-read on demand, when the
  // page becomes visible again, and after every request that touches them.
  const [customDevices, setCustomDevices] = useState<CustomDevice[]>(initialCustom?.devices ?? []);
  const reloadCustom = useCallback(async () => {
    const result = await listCustomDevices();
    if (result.ok) setCustomDevices(result.data.devices);
  }, []);
  useEffect(() => {
    if (initialCustom === null) void reloadCustom();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reloadCustom();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // Runs once: `initialCustom` is only the starting value.
  }, []);
  const applyCustom = useCallback((card: CustomDevice) => {
    setCustomDevices((current) => current.map((item) => (item.id === card.id ? card : item)));
  }, []);
  const onToggleCustomFavorite = useCallback(
    async (card: CustomDevice) => {
      setFavoriteError(null);
      const result = await updateCustomDevice(card.id, { favorite: !card.favorite });
      if (result.ok) applyCustom(result.data);
      else setFavoriteError(`Não foi possível alterar o favorito de ${card.name}.`);
    },
    [applyCustom],
  );

  // Commands go through the API; a returned device is the server's real view, so it is applied at once.
  const onCommand = useCallback(
    async (deviceId: string, command: string, params?: Record<string, unknown>) => {
      const result = await executeDeviceCommand(deviceId, command, params);
      if (result.device) apply(result.device);
      return result;
    },
    [apply],
  );

  const onToggleFavorite = useCallback(
    async (device: Device) => {
      setFavoriteError(null);
      const updated = await updateDeviceSettings(device.id, { favorite: !device.favorite });
      if (updated) apply(updated);
      else setFavoriteError(`Não foi possível alterar o favorito de ${device.name}.`);
    },
    [apply],
  );

  const roomDestinations = useMemo(() => {
    const byName = new Map<string, { id: string; name: string }>();
    const add = (room: { id: string; name: string }) =>
      byName.set(room.name.trim().toLocaleLowerCase('pt-BR'), room);
    for (const device of devices) if (device.room) add(device.room);
    for (const card of customDevices) if (card.room) add(card.room);
    for (const room of savedRooms) add(room);
    return new Map([...byName.values()].map((room) => [room.name, room.id]));
  }, [devices, customDevices, savedRooms]);
  // Sections and filters use the display group, including local overrides of an HA area.
  const rooms = [...roomDestinations.keys()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((name) => [name, name] as const);

  const entries = useMemo<Entry[]>(
    () => [
      ...devices.map((device): Entry => ({
        kind: 'device',
        name: device.name,
        room: device.room
          ? {
              ...device.room,
              name:
                savedRooms.find(
                  (room) =>
                    room.name.toLocaleLowerCase('pt-BR') ===
                    device.room!.name.trim().toLocaleLowerCase('pt-BR'),
                )?.name ?? device.room.name,
            }
          : null,
        device,
      })),
      ...customDevices.map((custom): Entry => ({
        kind: 'custom',
        name: custom.name,
        room: custom.room,
        custom,
      })),
    ],
    [devices, customDevices, savedRooms],
  );
  const categoryOfEntry = (entry: Entry): CategoryId =>
    entry.kind === 'custom' ? CUSTOM_CATEGORY : categoryOf(entry.device);
  const isFavorite = (entry: Entry) =>
    entry.kind === 'custom' ? entry.custom.favorite : entry.device.favorite;

  const presentCategories = useMemo(
    () => CATEGORIES.filter((c) => entries.some((entry) => categoryOfEntry(entry) === c.id)),
    [entries],
  );
  const favoriteCount = entries.filter(isFavorite).length;

  const visible = useMemo(
    () =>
      entries
        .filter((entry) =>
          filter === 'all'
            ? true
            : filter === 'favorites'
              ? isFavorite(entry)
              : categoryOfEntry(entry) === filter,
        )
        .filter((entry) => roomId === 'all' || entry.room?.name === roomId),
    [entries, filter, roomId],
  );
  const entryId = (entry: Entry) => (entry.kind === 'custom' ? entry.custom.id : entry.device.id);
  const cardEntries = entries.filter(
    (entry) => entry.kind === 'custom' || isControllable(entry.device),
  );
  const fullOrder = [...(ordering.layout?.cardIds ?? [])];
  const known = new Set(fullOrder);
  for (const entry of [...cardEntries].sort(
    (a, b) => a.name.localeCompare(b.name, 'pt-BR') || entryId(a).localeCompare(entryId(b)),
  )) {
    if (!known.has(entryId(entry))) {
      fullOrder.push(entryId(entry));
      known.add(entryId(entry));
    }
  }
  const ranks = new Map(fullOrder.map((id, index) => [id, index]));
  const roomGroups = groupByRoom(visible);
  if (editing) {
    for (const [name] of rooms)
      if (!roomGroups.some((group) => group.room === name))
        roomGroups.push({ room: name, items: [] });
    roomGroups.sort((a, b) =>
      a.room === NO_ROOM_LABEL
        ? 1
        : b.room === NO_ROOM_LABEL
          ? -1
          : a.room.localeCompare(b.room, 'pt-BR'),
    );
  }
  const groups = roomGroups.map((group) => ({
    ...group,
    items: group.items.sort(
      (a, b) => (ranks.get(entryId(a)) ?? Infinity) - (ranks.get(entryId(b)) ?? Infinity),
    ),
  }));

  const filters: Array<{ id: Filter; label: string }> = [
    { id: 'all', label: 'Todos' },
    ...(favoriteCount > 0
      ? [{ id: 'favorites' as const, label: `Favoritos (${favoriteCount})` }]
      : []),
    ...presentCategories.map((c) => ({ id: c.id, label: c.label })),
  ];
  // A filter whose devices disappeared (e.g. a category emptied by a live update) falls back to all.
  const activeFilter = filters.some((f) => f.id === filter) ? filter : 'all';
  const activeRoom = roomId === 'all' || rooms.some(([id]) => id === roomId) ? roomId : 'all';

  const movingDisabled = ordering.status !== 'ready' || creatingRoom;
  const moveToRoom = (source: string, destination: string, target?: string) => {
    if (movingDisabled) return;
    const targetRoomId = roomDestinations.get(destination);
    const entry = entries.find((item) => entryId(item) === source);
    if (!targetRoomId || !entry || entry.room?.name === destination) return;
    const next = fullOrder.filter((id) => id !== source);
    // Dropping on a card inserts before it. Dropping on the section appends after its last card,
    // including cards hidden by category/favorite filters.
    const destinationIds = new Set(
      cardEntries.filter((item) => item.room?.name === destination).map(entryId),
    );
    const targetIndex = target ? next.indexOf(target) : -1;
    let position = targetIndex;
    if (position < 0) {
      position = next.reduce(
        (last, id, index) => (destinationIds.has(id) ? index + 1 : last),
        next.length,
      );
    }
    next.splice(position, 0, source);
    void ordering.moveRoom(next, source, targetRoomId, (result) => {
      if (result.device) apply(result.device);
      if (result.custom) applyCustom(result.custom);
      setSavedRooms(result.rooms);
      setRoomId('all');
      setMoveNotice(`${entry.name} movido para ${destination}.`);
    });
  };

  const badge = CONNECTION_BADGE[connection];
  const unavailable = summary?.byAvailability.unavailable ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Dispositivos</h1>
          <p className="text-xs text-muted-foreground md:text-sm">
            {loaded && summary
              ? `${summary.total + customDevices.length} ${
                  summary.total + customDevices.length === 1 ? 'dispositivo' : 'dispositivos'
                }${unavailable > 0 ? ` · ${unavailable} indisponível(is)` : ''}`
              : 'Carregando…'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Badge variant={badge.variant} data-testid="connection">
            {badge.label}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Atualizar"
            title="Atualizar"
            onClick={() => {
              void refresh();
              void reloadCustom();
            }}
            disabled={refreshing}
          >
            <RefreshCw
              aria-hidden
              className={cn(refreshing && 'animate-spin motion-reduce:animate-none')}
            />
          </Button>
        </div>
      </div>

      {connection === 'reconnecting' ? (
        <Alert variant="warning">
          <WifiOff aria-hidden />
          <div>
            <AlertTitle>Atualização ao vivo interrompida</AlertTitle>
            <AlertDescription>
              Reconectando. Enquanto isso a lista é atualizada a cada poucos segundos.
              {updatedAt ? ` Última atualização às ${timeFormat.format(updatedAt)}.` : ''}
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {stale && loaded ? (
        <Alert variant="danger">
          <CircleAlert aria-hidden />
          <div>
            <AlertTitle>Não foi possível atualizar</AlertTitle>
            <AlertDescription>
              O servidor não respondeu. O que aparece abaixo pode estar desatualizado
              {updatedAt ? ` (última atualização às ${timeFormat.format(updatedAt)})` : ''}.
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {loaded && summary && !summary.ready && customDevices.length > 0 ? (
        <Alert variant="warning">
          <WifiOff aria-hidden />
          <div>
            <AlertTitle>Home Assistant ainda não está conectado</AlertTitle>
            <AlertDescription>
              {summary.lastError
                ? `Última falha: ${summary.lastError.message}`
                : 'Os cartões abaixo podem não funcionar até a primeira sincronização.'}
            </AlertDescription>
          </div>
        </Alert>
      ) : null}

      {favoriteError ? (
        <Alert variant="danger">
          <CircleAlert aria-hidden />
          <AlertDescription>{favoriteError}</AlertDescription>
        </Alert>
      ) : null}

      {!loaded ? (
        stale ? (
          <EmptyState
            icon={WifiOff}
            title="Não foi possível carregar os dispositivos"
            description="O servidor não respondeu. Verifique se a API está em execução e tente de novo."
          >
            <Button onClick={() => void refresh()} disabled={refreshing}>
              Tentar de novo
            </Button>
          </EmptyState>
        ) : (
          <div
            aria-busy="true"
            aria-label="Carregando dispositivos"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-40" />
            ))}
          </div>
        )
      ) : summary && !summary.ready && customDevices.length === 0 ? (
        <EmptyState
          icon={WifiOff}
          title="Home Assistant ainda não está conectado"
          description={
            summary.lastError
              ? `Última falha: ${summary.lastError.message}`
              : 'Configure o Home Assistant e aguarde a primeira sincronização.'
          }
        />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhum dispositivo encontrado"
          description="O Home Assistant está conectado, mas não expõe nenhum dispositivo compatível."
        >
          <Link href="/devices/custom" className={buttonVariants({ variant: 'outline' })}>
            <Lightbulb aria-hidden />
            Criar cartão personalizado
          </Link>
        </EmptyState>
      ) : (
        <>
          {/* Sticky under the app bar: the filters stay in reach however far the list scrolls. */}
          <div className="sticky top-[calc(3rem+env(safe-area-inset-top))] z-10 -mx-4 border-b bg-background/95 backdrop-blur md:top-[calc(3.5rem+env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] md:flex-wrap md:overflow-visible">
              {rooms.length > 0 ? (
                <select
                  aria-label="Cômodo"
                  value={activeRoom}
                  onChange={(event) => setRoomId(event.target.value)}
                  className="h-11 shrink-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:h-9"
                >
                  <option value="all">Todos os cômodos</option>
                  {rooms.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              ) : null}
              <div
                role="group"
                aria-label="Filtrar por categoria"
                className="flex items-center gap-2 md:flex-wrap"
              >
                {filters.map((f) => (
                  <Button
                    key={f.id}
                    size="chip"
                    variant={activeFilter === f.id ? 'default' : 'outline'}
                    aria-pressed={activeFilter === f.id}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={editing ? 'default' : 'outline'}
              aria-pressed={editing}
              disabled={movingDisabled}
              onClick={() => setEditing(!editing)}
            >
              {editing ? 'Concluir organização' : 'Organizar cartões'}
            </Button>
            <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
              {ordering.status === 'saving'
                ? 'Salvando ordem…'
                : ordering.status === 'loading'
                  ? 'Carregando ordem…'
                  : ordering.status === 'ready'
                    ? moveNotice
                      ? `${moveNotice} Ordem salva.`
                      : ''
                    : ''}
            </p>
          </div>
          {editing ? (
            <p className="text-sm text-muted-foreground">
              Arraste pela alça até outro cartão ou solte em um cômodo para mudar o grupo. Use as
              setas para ordenar ou escolha “Mover para cômodo”. Os controles dos cartões ficam
              desativados durante a organização. Cada movimento é salvo automaticamente.
            </p>
          ) : null}
          {ordering.status === 'error' ? (
            <Alert variant="danger">
              <CircleAlert aria-hidden />
              <div>
                <AlertTitle>Não foi possível confirmar a ordem no servidor</AlertTitle>
                <AlertDescription>
                  A ordem exibida pode não estar salva ou ter sido alterada em outra aba. Recarregue
                  a ordem salva antes de continuar organizando.
                </AlertDescription>
                <Button variant="outline" className="mt-2" onClick={() => window.location.reload()}>
                  Recarregar ordem salva
                </Button>
              </div>
            </Alert>
          ) : null}

          {editing ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                if (movingDisabled || !roomName.trim()) return;
                setCreatingRoom(true);
                setRoomError(null);
                try {
                  const result = await createRoom(roomName.trim());
                  if (result.ok) {
                    setSavedRooms((current) => [...current, result.data]);
                    setRoomName('');
                    setMoveNotice(`Cômodo ${result.data.name} criado. Arraste um cartão para ele.`);
                  } else
                    setRoomError(
                      result.code === 'conflict'
                        ? 'Já existe um cômodo com esse nome.'
                        : 'Não foi possível criar o cômodo. Confira a conexão e tente novamente.',
                    );
                } finally {
                  setCreatingRoom(false);
                }
              }}
            >
              <label
                htmlFor="new-dashboard-room"
                className="flex min-w-0 flex-1 flex-col gap-1 text-sm"
              >
                Novo cômodo
                <Input
                  id="new-dashboard-room"
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  maxLength={40}
                  required
                  placeholder="Ex.: Sala de estar"
                  disabled={movingDisabled}
                />
              </label>
              <Button type="submit" variant="outline" disabled={movingDisabled || !roomName.trim()}>
                {creatingRoom ? 'Criando…' : 'Criar cômodo'}
              </Button>
            </form>
          ) : null}
          {roomError ? (
            <Alert variant="danger">
              <CircleAlert aria-hidden />
              <AlertDescription>{roomError}</AlertDescription>
            </Alert>
          ) : null}

          {visible.length === 0 && !editing ? (
            <EmptyState
              icon={SearchX}
              title="Nenhum dispositivo com esses filtros"
              description="Ajuste ou limpe os filtros para ver os outros dispositivos."
            >
              <Button
                variant="outline"
                onClick={() => {
                  setFilter('all');
                  setRoomId('all');
                }}
              >
                Limpar filtros
              </Button>
            </EmptyState>
          ) : (
            groups.map((group) => {
              const cards = group.items.filter(
                (entry) => entry.kind === 'custom' || isControllable(entry.device),
              );
              const readOnly = group.items.flatMap((entry) =>
                entry.kind === 'device' && !isControllable(entry.device) ? [entry.device] : [],
              );
              return (
                <section
                  key={group.room}
                  aria-label={group.room}
                  data-order-room={editing && group.room !== NO_ROOM_LABEL ? group.room : undefined}
                  className={cn(
                    'flex min-w-0 flex-col gap-2 rounded-lg',
                    editing && 'border border-dashed border-input p-2',
                    dropRoom === group.room && 'ring-2 ring-primary',
                  )}
                >
                  <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {group.room}
                  </h2>
                  {cards.length > 0 ? (
                    <OrderingGrid
                      editing={editing}
                      disabled={movingDisabled}
                      room={group.room}
                      rooms={rooms.map(([name]) => name)}
                      onRoomDrop={moveToRoom}
                      onDragTarget={setDropRoom}
                      items={cards.map((entry) => ({
                        id: entryId(entry),
                        name: entry.name,
                        content:
                          entry.kind === 'device' ? (
                            <DeviceTile
                              device={entry.device}
                              onCommand={onCommand}
                              onToggleFavorite={onToggleFavorite}
                            />
                          ) : (
                            <CustomDeviceTile
                              device={entry.custom}
                              onChange={applyCustom}
                              onToggleFavorite={onToggleCustomFavorite}
                            />
                          ),
                      }))}
                      onMove={(source, target) => {
                        const ids = cards.map(entryId);
                        const updated = moveVisibleCard(fullOrder, ids, source, target);
                        if (updated === fullOrder) return;
                        setMoveNotice(
                          `${cards.find((entry) => entryId(entry) === source)?.name}: posição ${ids.indexOf(target) + 1} de ${ids.length}.`,
                        );
                        void ordering.save(updated);
                      }}
                    />
                  ) : null}
                  {editing && cards.length === 0 ? (
                    <p className="flex min-h-24 items-center justify-center rounded-md bg-muted/40 p-3 text-center text-sm text-muted-foreground">
                      Solte um cartão aqui para movê-lo para {group.room}.
                    </p>
                  ) : null}
                  {readOnly.length > 0 ? (
                    <Card>
                      <ul className="divide-y">
                        {readOnly.map((device) => (
                          <DeviceRow
                            key={device.id}
                            device={device}
                            onToggleFavorite={onToggleFavorite}
                          />
                        ))}
                      </ul>
                    </Card>
                  ) : null}
                </section>
              );
            })
          )}
          <Link
            href="/devices/custom"
            className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
          >
            <Lightbulb aria-hidden />
            Cartões personalizados
          </Link>
        </>
      )}
    </div>
  );
}
