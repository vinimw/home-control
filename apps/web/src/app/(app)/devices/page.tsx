import type { Metadata } from 'next';
import { DevicesDashboard } from '@/components/devices/devices-dashboard';
import { getCustomDevices, getDevices } from '@/lib/api';

export const metadata: Metadata = { title: 'Dispositivos' };

// Rendered per request: the first paint already has real data; the client then keeps it live.
export const dynamic = 'force-dynamic';

export default async function DevicesPage() {
  const [devices, custom] = await Promise.all([getDevices(), getCustomDevices()]);
  return <DevicesDashboard initial={devices} initialCustom={custom} />;
}
