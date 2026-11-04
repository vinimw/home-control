import type { Metadata } from 'next';
import { EchoPanel } from '@/components/echo/echo-panel';
import { getAlexaCommands, getDevices } from '@/lib/api';

export const metadata: Metadata = { title: 'Echo' };
export const dynamic = 'force-dynamic';

export default async function EchoPage({
  searchParams,
}: {
  searchParams: Promise<{ device?: string | string[] }>;
}) {
  const { device } = await searchParams;
  const [devices, commands] = await Promise.all([getDevices(), getAlexaCommands()]);
  return (
    <EchoPanel
      initialDevices={devices}
      initialCommands={commands}
      preferredDeviceId={typeof device === 'string' ? device : undefined}
    />
  );
}
