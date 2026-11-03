'use client';

import { useCallback, useMemo, useState } from 'react';
import { CircleAlert, LayoutGrid, RefreshCw, SearchX, WifiOff } from 'lucide-react';
import type { Device, DeviceListResponse } from '@home-control/shared';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { executeDeviceCommand, updateDeviceSettings } from '@/lib/devices-client';
import { cn } from '@/lib/utils';
import { CATEGORIES, categoryOf, NO_ROOM_LABEL, type CategoryId } from './categories';
import { DeviceTile } from './device-tile';
import { useDevices, type Connection } from './use-devices';

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

function groupByRoom(devices: Device[]): Array<{ room: string; devices: Device[] }> {
  const groups = new Map<string, Device[]>();
  for (const device of devices) {
    const key = device.room?.name ?? NO_ROOM_LABEL;
    groups.set(key, [...(groups.get(key) ?? []), device]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) =>
      a === NO_ROOM_LABEL ? 1 : b === NO_ROOM_LABEL ? -1 : a.localeCompare(b, 'pt-BR'),
    )
    .map(([room, list]) => ({
      room,
      devices: list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    }));
}

export function DevicesDashboard({ initial }: { initial: DeviceListResponse | null }) {
  const view = useDevices(initial);
  const { devices, summary, loaded, stale, connection, updatedAt, refreshing, refresh, apply } =
    view;
  const [filter, setFilter] = useState<Filter>('all');
  const [roomId, setRoomId] = useState<string>('all');
  const [favoriteError, setFavoriteError] = useState<string | null>(null);

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

  const rooms = useMemo(() => {
    const byId = new Map<string, string>();
    for (const device of devices) if (device.room) byId.set(device.room.id, device.room.name);
    return [...byId.entries()].sort(([, a], [, b]) => a.localeCompare(b, 'pt-BR'));
  }, [devices]);

  const presentCategories = useMemo(
    () => CATEGORIES.filter((c) => devices.some((device) => categoryOf(device) === c.id)),
    [devices],
  );
  const favoriteCount = devices.filter((device) => device.favorite).length;

  const visible = useMemo(
    () =>
      devices
        .filter((device) =>
          filter === 'all'
            ? true
            : filter === 'favorites'
              ? device.favorite
              : categoryOf(device) === filter,
        )
        .filter((device) => roomId === 'all' || device.room?.id === roomId),
    [devices, filter, roomId],
  );
  const groups = useMemo(() => groupByRoom(visible), [visible]);

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

  const badge = CONNECTION_BADGE[connection];
  const unavailable = summary?.byAvailability.unavailable ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dispositivos</h1>
          <p className="text-sm text-muted-foreground">
            {loaded && summary
              ? `${summary.total} ${summary.total === 1 ? 'dispositivo' : 'dispositivos'}${
                  unavailable > 0 ? ` · ${unavailable} indisponível(is)` : ''
                }`
              : 'Carregando…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={badge.variant} data-testid="connection">
            {badge.label}
          </Badge>
          <Button variant="outline" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw
              aria-hidden
              className={cn(refreshing && 'animate-spin motion-reduce:animate-none')}
            />
            Atualizar
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
      ) : summary && !summary.ready ? (
        <EmptyState
          icon={WifiOff}
          title="Home Assistant ainda não está conectado"
          description={
            summary.lastError
              ? `Última falha: ${summary.lastError.message}`
              : 'Configure o Home Assistant e aguarde a primeira sincronização.'
          }
        />
      ) : devices.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="Nenhum dispositivo encontrado"
          description="O Home Assistant está conectado, mas não expõe nenhum dispositivo compatível."
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div role="group" aria-label="Filtrar por categoria" className="flex flex-wrap gap-2">
              {filters.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  variant={activeFilter === f.id ? 'default' : 'outline'}
                  aria-pressed={activeFilter === f.id}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            {rooms.length > 0 ? (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Cômodo</span>
                <select
                  value={activeRoom}
                  onChange={(event) => setRoomId(event.target.value)}
                  className="h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <option value="all">Todos</option>
                  {rooms.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          {visible.length === 0 ? (
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
            groups.map((group) => (
              <section key={group.room} aria-label={group.room} className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold tracking-tight">{group.room}</h2>
                <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.devices.map((device) => (
                    <DeviceTile
                      key={device.id}
                      device={device}
                      onCommand={onCommand}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
