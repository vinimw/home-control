import type { Metadata } from 'next';
import { Info, TriangleAlert } from 'lucide-react';
import { ControlDemos } from '@/components/design/control-demos';
import { ControlStatus } from '@/components/controls/control-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommandPhase } from '@/components/controls/use-device-command';

export const metadata: Metadata = { title: 'Componentes' };

const PHASES: ReadonlyArray<{ label: string; state: CommandPhase }> = [
  { label: 'Nenhuma ação (idle)', state: { phase: 'idle' } },
  { label: 'Enviando (pending)', state: { phase: 'pending' } },
  { label: 'Aceito, sem confirmação (accepted)', state: { phase: 'accepted' } },
  { label: 'Confirmado (confirmed)', state: { phase: 'confirmed' } },
  {
    label: 'Falhou (failed)',
    state: { phase: 'failed', message: 'O dispositivo está indisponível.' },
  },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export default function DesignPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Componentes</h1>
        <p className="text-sm text-muted-foreground">
          Biblioteca visual usada em todo o aplicativo.
        </p>
      </div>

      <Alert variant="warning">
        <TriangleAlert aria-hidden />
        <div>
          <AlertTitle>Demonstração visual</AlertTitle>
          <AlertDescription>
            Nenhum controle desta página aciona dispositivos reais. Os comandos de exemplo falham de
            propósito para nunca simular um sucesso.
          </AlertDescription>
        </div>
      </Alert>

      <Section title="Botões" description="Alvos de toque de 44 px.">
        <div className="flex flex-wrap gap-3">
          <Button>Principal</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="outline">Contorno</Button>
          <Button variant="ghost">Discreto</Button>
          <Button variant="destructive">Destrutivo</Button>
          <Button disabled>Desativado</Button>
        </div>
      </Section>

      <Section title="Selos de estado">
        <div className="flex flex-wrap gap-2">
          <Badge variant="success">Disponível</Badge>
          <Badge variant="warning">Sem leitura</Badge>
          <Badge variant="danger">Indisponível</Badge>
          <Badge variant="muted">Desconhecido</Badge>
          <Badge variant="outline">Contorno</Badge>
        </div>
      </Section>

      <Section title="Avisos">
        <div className="grid gap-3 md:grid-cols-2">
          <Alert variant="info">
            <Info aria-hidden />
            <AlertDescription>Informação neutra, anunciada de forma educada.</AlertDescription>
          </Alert>
          <Alert variant="danger">
            <TriangleAlert aria-hidden />
            <AlertDescription>Erro, anunciado imediatamente por leitores de tela.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section
        title="Estados de um comando"
        description="O estado “Confirmado” só aparece quando o próprio dispositivo confirma. “Aceito” significa que o comando foi enviado, mas o efeito não foi verificado."
      >
        <Card>
          <CardContent className="grid gap-3 pt-4 sm:pt-5">
            {PHASES.map(({ label, state }) => (
              <div
                key={label}
                className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm text-muted-foreground">{label}</span>
                <ControlStatus state={state} />
              </div>
            ))}
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Cartões de dispositivo"
        description="Disponível, indisponível (controles desativados) e sem leitura. Toque nos controles para ver uma falha honesta."
      >
        <ControlDemos />
      </Section>

      <Section title="Carregando">
        <Card>
          <CardHeader>
            <CardTitle>Esqueleto</CardTitle>
            <CardDescription>Placeholder enquanto o conteúdo carrega.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
