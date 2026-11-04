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
    note: 'Offline ou desconectado. Controles desativados.',
  },
  unknown: {
    label: 'Sem leitura',
    variant: 'warning',
    note: 'Ainda não informou o estado.',
  },
};

/**
 * Availability, always stated in text. A normal device gets a small dot (its name is read out as
 * "Disponível"); anything abnormal gets a labelled badge, so it stands out without relying on color alone.
 */
export function AvailabilityIndicator({ availability }: { availability: DeviceAvailability }) {
  const info = AVAILABILITY[availability];
  if (availability === 'available') {
    return (
      <span
        role="img"
        aria-label={info.label}
        title={info.label}
        className="inline-block size-2.5 shrink-0 rounded-full bg-success"
      />
    );
  }
  return <Badge variant={info.variant}>{info.label}</Badge>;
}

export const availabilityNote = (availability: DeviceAvailability): string | undefined =>
  AVAILABILITY[availability].note;

interface DeviceCardProps {
  name: string;
  /** Shown under the name. Omit it when the card already sits under a room heading. */
  room?: string | null;
  availability: DeviceAvailability;
  /** Extra header control, e.g. a favorite toggle. */
  action?: ReactNode;
  children?: ReactNode;
}

/** Compact card for one device: name, honest availability and its controls. */
export function DeviceCard({ name, room, availability, action, children }: DeviceCardProps) {
  const note = availabilityNote(availability);
  const blocked = availability === 'unavailable';

  return (
    <DeviceControlContext.Provider value={{ disabled: blocked }}>
      <Card>
        <CardHeader className="pb-1">
          <div className="flex min-h-11 items-center justify-between gap-2">
            <CardTitle className="min-w-0 text-sm [overflow-wrap:anywhere]">{name}</CardTitle>
            <div className="-mr-1 flex shrink-0 items-center gap-1">
              <AvailabilityIndicator availability={availability} />
              {action}
            </div>
          </div>
          {room ? <CardDescription className="text-xs">{room}</CardDescription> : null}
          {note ? <CardDescription className="text-xs">{note}</CardDescription> : null}
        </CardHeader>
        {children ? <CardContent className="flex flex-col gap-2">{children}</CardContent> : null}
      </Card>
    </DeviceControlContext.Provider>
  );
}
