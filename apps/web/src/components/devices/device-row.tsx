'use client';

import { memo } from 'react';
import type { Device } from '@home-control/shared';
import { AvailabilityIndicator, availabilityNote } from '@/components/controls';
import { FavoriteButton } from './favorite-button';
import { readings } from './device-tile';

/**
 * A device with nothing to control (sensors, read-only players): one compact line instead of a whole card,
 * so a house full of sensors does not turn into pages of scrolling.
 */
function DeviceRowImpl({
  device,
  onToggleFavorite,
}: {
  device: Device;
  onToggleFavorite: (device: Device) => void;
}) {
  const detail = availabilityNote(device.availability) ?? readings(device).join(' · ');

  return (
    <li className="flex min-h-12 items-center gap-2 py-0.5 pl-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium [overflow-wrap:anywhere]">{device.name}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      <AvailabilityIndicator availability={device.availability} />
      <FavoriteButton device={device} onToggle={onToggleFavorite} />
    </li>
  );
}

export const DeviceRow = memo(DeviceRowImpl);
