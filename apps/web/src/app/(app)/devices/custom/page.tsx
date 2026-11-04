import type { Metadata } from 'next';
import { CustomDevicesPanel } from '@/components/devices/custom-devices-panel';
import { getAlexaCommands, getCustomDevices, getDevices, getRooms } from '@/lib/api';

export const metadata: Metadata = { title: 'Cartões personalizados' };
export const dynamic = 'force-dynamic';

export default async function CustomDevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const { edit } = await searchParams;
  const [custom, commands, rooms, devices] = await Promise.all([
    getCustomDevices(),
    getAlexaCommands(),
    getRooms(),
    getDevices(),
  ]);
  const echoes = (devices?.devices ?? [])
    .filter((device) => device.capabilities.includes('voice_command'))
    .map((device) => ({ id: device.id, name: device.name }));
  return (
    <CustomDevicesPanel
      initialDevices={custom?.devices ?? null}
      initialCommands={commands?.commands ?? null}
      initialRooms={rooms?.rooms ?? null}
      echoes={echoes}
      editId={typeof edit === 'string' ? edit : undefined}
    />
  );
}
