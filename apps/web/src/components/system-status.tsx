import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import type { HomeAssistantStatusResponse } from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { SystemStatus } from '@/lib/api';
import { describeHomeAssistant, type Tone } from '@/lib/status';

function Row({
  label,
  tone,
  value,
  detail,
}: {
  label: string;
  tone: Tone;
  value: string;
  detail?: ReactNode;
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      </div>
      <Badge variant={tone}>{value}</Badge>
    </li>
  );
}

function devicesView(status: HomeAssistantStatusResponse | null) {
  if (!status?.configured) return { value: '—', tone: 'muted' as const, detail: undefined };
  const { ready, total, byAvailability } = status.devices;
  if (!ready)
    return {
      value: 'Carregando',
      tone: 'warning' as const,
      detail: 'Sincronizando com o Home Assistant.',
    };
  const offline = byAvailability.unavailable;
  return {
    value: `${total}`,
    tone: 'muted' as const,
    detail: offline > 0 ? `${offline} indisponível(is)` : 'Todos respondendo',
  };
}

/** Real status of the system, read from the API. Unknown is shown as unknown, never as OK. */
export function SystemStatusCard({ status }: { status: SystemStatus }) {
  const ha = describeHomeAssistant(status.homeAssistant);
  const devices = devicesView(status.homeAssistant);
  const apiUp = status.api?.status === 'ok';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Estado do sistema</CardTitle>
        <CardDescription>Leitura em tempo real da API e do Home Assistant.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          <Row
            label="API"
            tone={apiUp ? 'success' : 'danger'}
            value={apiUp ? 'Online' : 'Indisponível'}
            detail={apiUp ? undefined : 'Não foi possível falar com a API.'}
          />
          <Row label="Home Assistant" tone={ha.tone} value={ha.label} detail={ha.detail} />
          <Row
            label="Dispositivos"
            tone={devices.tone}
            value={devices.value}
            detail={devices.detail}
          />
        </ul>
        {status.homeAssistant?.devices.enrichment === 'states_only' ? (
          <Alert variant="info" className="mt-3">
            <Info aria-hidden />
            <AlertDescription>
              Sem salas nem fabricantes: use um token de administrador do Home Assistant.
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
