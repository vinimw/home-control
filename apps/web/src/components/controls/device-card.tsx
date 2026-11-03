'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { DeviceAvailability } from '@home-control/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const DeviceControlContext = createContext<{ disabled: boolean }>({ disabled: false });

/** Controls inside a DeviceCard are disabled automatically while the device cannot be controlled. */
export function useControlDisabled(local?: boolean): boolean {
  return useContext(DeviceControlContext).disabled || Boolean(local);
}

const AVAILABILITY: Record<
  DeviceAvailability,
  { label: string; variant: 'success' | 'danger' | 'warning'; note?: string }
> = {
  available: { label: 'Disponível', variant: 'success' },
  unavailable: {
    label: 'Indisponível',
    variant: 'danger',
    note: 'O dispositivo está offline ou desconectado. Os controles ficam desativados.',
  },
  unknown: {
    label: 'Sem leitura',
    variant: 'warning',
    note: 'O dispositivo ainda não informou o estado.',
  },
};

interface DeviceCardProps {
  name: string;
  room?: string | null;
  availability: DeviceAvailability;
  children?: ReactNode;
}

/** Card for one device: name, room, honest availability badge and its controls. */
export function DeviceCard({ name, room, availability, children }: DeviceCardProps) {
  const info = AVAILABILITY[availability];
  const blocked = availability === 'unavailable';

  return (
    <DeviceControlContext.Provider value={{ disabled: blocked }}>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <CardTitle>{name}</CardTitle>
            <Badge variant={info.variant}>{info.label}</Badge>
          </div>
          {room ? <CardDescription>{room}</CardDescription> : null}
          {info.note ? <CardDescription>{info.note}</CardDescription> : null}
        </CardHeader>
        {children ? <CardContent className="flex flex-col gap-4">{children}</CardContent> : null}
      </Card>
    </DeviceControlContext.Provider>
  );
}
