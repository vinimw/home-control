import type { Metadata } from 'next';
import { MusicPanel } from '@/components/spotify/music-panel';

export const metadata: Metadata = { title: 'Música' };
export const dynamic = 'force-dynamic';

export default function MusicPage() {
  return <MusicPanel />;
}
