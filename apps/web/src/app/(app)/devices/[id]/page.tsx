import type { Metadata } from 'next';
import { TvRemote } from '@/components/devices/tv-remote';
import { getDevices } from '@/lib/api';

export const metadata: Metadata = { title: 'Controle remoto' };
export const dynamic = 'force-dynamic';

export default async function DeviceRemotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TvRemote initial={await getDevices()} deviceId={id} />;
}
