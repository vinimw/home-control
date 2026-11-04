'use client';

import { Star } from 'lucide-react';
import type { Device } from '@home-control/shared';
import { cn } from '@/lib/utils';

/** Favorite toggle with a 44px touch target. */
export function FavoriteButton({
  device,
  onToggle,
}: {
  device: Device;
  onToggle: (device: Device) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(device)}
      aria-pressed={device.favorite}
      aria-label={
        device.favorite
          ? `Remover ${device.name} dos favoritos`
          : `Adicionar ${device.name} aos favoritos`
      }
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Star aria-hidden className={cn('size-5', device.favorite && 'fill-warning text-warning')} />
    </button>
  );
}
