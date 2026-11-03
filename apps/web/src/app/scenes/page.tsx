import type { Metadata } from 'next';
import { Clapperboard } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Cenas' };

export default function ScenesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Cenas</h1>
      <EmptyState
        icon={Clapperboard}
        title="Cenas ainda não disponíveis"
        description="Cenas como Cinema, Boa noite e Música serão criadas e executadas aqui em uma versão futura."
      />
    </div>
  );
}
