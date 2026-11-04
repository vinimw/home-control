import { LayoutGrid } from 'lucide-react';
import { SystemStatusCard } from '@/components/system-status';
import { EmptyState } from '@/components/ui/empty-state';
import { getSystemStatus } from '@/lib/api';

// Rendered per request so the status is always fresh.
export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const status = await getSystemStatus();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Início</h1>
        <p className="text-sm text-muted-foreground">Visão geral da sua casa.</p>
      </div>
      <SystemStatusCard status={status} />
      <EmptyState
        icon={LayoutGrid}
        title="Visão geral dos dispositivos"
        description="Ainda não disponível. Quando estiver pronta, mostrará o estado e os controles de cada dispositivo."
      />
    </div>
  );
}
