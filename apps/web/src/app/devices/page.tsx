import type { Metadata } from 'next';
import { LayoutGrid } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Dispositivos' };

export default function DevicesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dispositivos</h1>
      <EmptyState
        icon={LayoutGrid}
        title="Nenhum dispositivo para mostrar ainda"
        description="A lista de dispositivos e seus controles ainda não está disponível nesta versão."
      />
    </div>
  );
}
