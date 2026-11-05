import type { Metadata } from 'next';
import { ScenesPanel } from '@/components/scenes/scenes-panel';

export const metadata: Metadata = { title: 'Cenas' };
export const dynamic = 'force-dynamic';

export default function ScenesPage() {
  return <ScenesPanel />;
}
