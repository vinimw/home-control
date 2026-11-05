import type { Metadata } from 'next';
import { DiagnosticsPanel } from '@/components/echo/diagnostics-panel';
export const metadata: Metadata = { title: 'Diagnóstico da Alexa' };
export default function Page() {
  return <DiagnosticsPanel />;
}
