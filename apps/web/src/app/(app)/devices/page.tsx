import type { Metadata } from 'next';
import { DevicesDashboard } from '@/components/devices/devices-dashboard';
import { getCustomDevices, getDeviceLayout, getDevices, getRooms } from '@/lib/api';

export const metadata: Metadata = { title: 'Dispositivos' };

// Rendered per request: the first paint already has real data; the client then keeps it live.
export const dynamic = 'force-dynamic';

export default async function DevicesPage() {
  const [devices, custom, layout, rooms] = await Promise.all([
    getDevices(),
    getCustomDevices(),
    getDeviceLayout(),
    getRooms(),
  ]);
  return (
    <DevicesDashboard
      initial={devices}
      initialCustom={custom}
      initialLayout={layout}
      initialRooms={rooms?.rooms ?? null}
    />
  );
}
