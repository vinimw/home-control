'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { DiagnosticsPage, DiagnosticEvent } from '@home-control/shared';
import { redirectToLogin } from '@/lib/csrf';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const format = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  dateStyle: 'short',
  timeStyle: 'medium',
});
const kinds: Record<string, string> = {
  operation: 'Operação local',
  rest: 'HTTP → Home Assistant',
  'ws-out': 'Mensagem WS enviada',
  'ws-in': 'Mensagem WS recebida',
  connection: 'Conexão WS',
};
const outcomes: Record<string, string> = {
  ok: 'Resposta recebida',
  pending: 'Em andamento / sem conclusão registrada',
  failed: 'Falhou',
  completed: 'Operação respondida',
  sent: 'Enviado',
  received: 'Recebido',
  timeout: 'Tempo esgotado',
  unreachable: 'Sem conexão',
  upstream_error: 'Erro do Home Assistant',
};
const field = 'w-full min-w-0 min-h-11 rounded-md border border-input bg-background px-2 text-sm';
async function read(query: string, signal?: AbortSignal): Promise<DiagnosticsPage> {
  const response = await fetch('/api/diagnostics/alexa?' + query, { cache: 'no-store', signal });
  if (response.status === 401) redirectToLogin();
  if (!response.ok) throw new Error('Não foi possível carregar os registros.');
  return response.json() as Promise<DiagnosticsPage>;
}
function exportFile(events: DiagnosticEvent[], formatName: 'json' | 'csv', metadata: unknown) {
  const cell = (value: unknown) => {
    let s = typeof value === 'string' ? value : JSON.stringify(value);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const csv = [
    'at',
    'completedAt',
    'kind',
    'source',
    'action',
    'outcome',
    'status',
    'durationMs',
    'operationId',
    'request',
    'response',
  ] as const;
  const content =
    formatName === 'json'
      ? JSON.stringify({ metadata, events }, null, 2)
      : '# ' +
        JSON.stringify(metadata) +
        '\r\n' +
        csv.join(',') +
        '\r\n' +
        events.map((e) => csv.map((key) => cell(e[key])).join(',')).join('\r\n');
  const url = URL.createObjectURL(
    new Blob([content], {
      type: formatName === 'json' ? 'application/json' : 'text/csv;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = `diagnostico-alexa.${formatName}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DiagnosticsPanel() {
  const [data, setData] = useState<DiagnosticsPage | null>(null);
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [live, setLive] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let inFlight = false;
    const load = async () => {
      if (inFlight || abort.signal.aborted) return;
      inFlight = true;
      setBusy(true);
      try {
        const next = await read(query + `&offset=${offset}&limit=50`, abort.signal);
        if (!abort.signal.aborted) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Falha ao carregar.');
      } finally {
        inFlight = false;
        if (!abort.signal.aborted) {
          setBusy(false);
          if (live)
            timer = setTimeout(() => {
              if (document.visibilityState === 'visible') void load();
            }, 10000);
        }
      }
    };
    const visible = () => {
      clearTimeout(timer);
      if (live && document.visibilityState === 'visible') void load();
    };
    void load();
    document.addEventListener('visibilitychange', visible);
    return () => {
      abort.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [query, offset, live, refresh]);
  const exportAll = async (type: 'json' | 'csv') => {
    setExporting(true);
    try {
      const result = await read(query + '&limit=10000');
      exportFile(result.events, type, {
        scope: 'Home Control → Home Assistant; Amazon não observado',
        timezone: 'America/Sao_Paulo',
        timestamps: 'UTC ISO 8601',
        query,
        exportedAt: new Date().toISOString(),
        total: result.total,
        collector: result.collector,
      });
    } catch {
      setError('Não foi possível exportar os registros.');
    } finally {
      setExporting(false);
    }
  };
  const buckets = data?.buckets.slice(-60) ?? [];
  const maximum = Math.max(1, ...buckets.map((b) => b.requests));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Link href="/echo" className={buttonVariants({ variant: 'outline' })}>
        Voltar para Alexa
      </Link>
      <h1 className="text-xl font-semibold">Diagnóstico da Alexa</h1>
      <Card className="space-y-2 p-3">
        <p className="font-medium">Atividade do nosso sistema → Home Assistant</p>
        <p className="text-sm text-muted-foreground">
          Inclui infraestrutura compartilhada com outros dispositivos. Uma operação local pode gerar
          zero, uma ou várias chamadas. As chamadas internas do Home Assistant à Amazon não são
          observadas nesta entrega. A tela não testa comandos nem consulta a Alexa.
        </p>
        <p className="text-sm">
          Estado da integração Alexa no HA: não consultado por este painel. Consultas e pausas não
          são alteradas.
        </p>
        {data ? (
          <p className="text-xs text-muted-foreground">
            Processo coletando desde {format.format(new Date(data.collector.startedAt))}. Histórico
            mais antigo:{' '}
            {data.collector.oldestAt ? format.format(new Date(data.collector.oldestAt)) : 'nenhum'}.
            Retenção: {data.collector.retentionDays} dias /{' '}
            {data.collector.maxEvents.toLocaleString('pt-BR')} eventos. Falhas de gravação neste
            processo: {data.collector.failures}.{' '}
            {data.collector.failures > 0 ? 'Contagem parcial: houve perda de registros.' : ''}
          </p>
        ) : null}
      </Card>
      <form
        className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const search = new URLSearchParams();
          for (const key of ['kind', 'source', 'outcome', 'q']) {
            const value = String(form.get(key) ?? '').trim();
            if (value) search.set(key, value);
          }
          for (const key of ['from', 'to']) {
            const value = String(form.get(key) ?? '');
            if (value) search.set(key, new Date(value).toISOString());
          }
          setOffset(0);
          setQuery(search.toString());
          setRefresh((n) => n + 1);
        }}
      >
        <label className="grid min-w-0 gap-1 text-sm">
          Tipo
          <select aria-label="Tipo" name="kind" className={field}>
            <option value="">Todos</option>
            {Object.entries(kinds).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Origem exata
          <Input name="source" placeholder="Ex.: background" maxLength={150} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Resultado
          <select aria-label="Resultado" name="outcome" className={field}>
            <option value="">Todos</option>
            {Object.entries(outcomes).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Buscar ação, alvo, código ou correlação
          <Input name="q" maxLength={100} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Desde (hora do navegador)
          <input name="from" type="datetime-local" step="1" className={field} />
        </label>
        <label className="grid min-w-0 gap-1 text-sm">
          Até (hora do navegador)
          <input name="to" type="datetime-local" step="1" className={field} />
        </label>
        <Button type="submit">Aplicar filtros</Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setLive(!live)} aria-pressed={live}>
          {live ? 'Pausar atualização' : 'Retomar atualização'}
        </Button>
        <Button variant="outline" onClick={() => setRefresh((n) => n + 1)} disabled={busy}>
          Atualizar registros locais
        </Button>
        {(['json', 'csv'] as const).map((type) => (
          <Button
            key={type}
            variant="outline"
            disabled={exporting || !data}
            onClick={() => void exportAll(type)}
          >
            Exportar {type.toUpperCase()}
          </Button>
        ))}
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {busy
          ? 'Carregando…'
          : live
            ? 'Atualização a cada 10 s enquanto a aba estiver visível.'
            : 'Atualização pausada. A coleta continua no servidor.'}
      </p>
      {error ? (
        <p role="alert" className="rounded-md border border-destructive p-3 text-destructive">
          {error} Os dados anteriores podem estar desatualizados.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Operações locais', data?.counts.operation ?? 0],
          ['Tentativas HTTP ao HA', data?.counts.rest ?? 0],
          ['Mensagens WS enviadas', data?.counts['ws-out'] ?? 0],
          ['Mensagens WS recebidas', data?.counts['ws-in'] ?? 0],
          ['Falhas HTTP ao HA', data?.counts.httpErrors ?? 0],
          ['HTTP 429 recebidos do HA', data?.counts.http429 ?? 0],
          ['HTTP sem conclusão', data?.counts.pending ?? 0],
          ['Amazon', 'Não observado'],
        ].map(([name, value]) => (
          <Card key={name} className="min-w-0 p-3">
            <p className="text-xs text-muted-foreground">{name}</p>
            <p className="break-words text-lg font-semibold">{value}</p>
          </Card>
        ))}
      </div>
      <Card className="min-w-0 space-y-2 p-3">
        <h2 className="font-semibold">Tentativas HTTP por minuto</h2>
        <p className="text-xs text-muted-foreground">
          Últimos 60 minutos com registros do período filtrado. Lacunas não representam ausência
          garantida de tráfego. Horários: America/Sao_Paulo.
        </p>
        {buckets.length ? (
          <>
            <svg
              viewBox="0 0 600 110"
              role="img"
              aria-label="Tentativas HTTP ao HA por minuto; tabela detalhada abaixo"
              className="h-32 w-full"
            >
              {buckets.map((b, i) => (
                <g key={b.at}>
                  <rect
                    x={(i * 600) / buckets.length}
                    y={100 - (b.requests / maximum) * 95}
                    width={Math.max(1, 600 / buckets.length - 2)}
                    height={(b.requests / maximum) * 95}
                    fill="currentColor"
                    className="text-primary"
                  />
                  <rect
                    x={(i * 600) / buckets.length}
                    y={100 - (b.errors / maximum) * 95}
                    width={Math.max(1, 600 / buckets.length - 2)}
                    height={(b.errors / maximum) * 95}
                    fill="currentColor"
                    className="text-destructive"
                  />
                </g>
              ))}
            </svg>
            <details>
              <summary className="min-h-11 cursor-pointer py-3">
                Ver números do gráfico (tentativas / falhas)
              </summary>
              {buckets.map((b) => (
                <p key={b.at} className="text-xs">
                  {format.format(new Date(b.at))}: {b.requests} / {b.errors}
                </p>
              ))}
            </details>
          </>
        ) : (
          <p className="text-sm">Nenhuma tentativa HTTP neste recorte.</p>
        )}
      </Card>
      <h2 className="font-semibold">Histórico — America/Sao_Paulo (UTC−03)</h2>
      {data?.events.length === 0 ? (
        <p>Nenhum registro encontrado. Não há reconstrução de histórico anterior à instalação.</p>
      ) : null}
      {data?.events.map((event) => (
        <Card key={event.id} className="min-w-0 space-y-2 p-3">
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <time dateTime={event.at}>{format.format(new Date(event.at))}</time>
            <span>
              {kinds[event.kind]} · {outcomes[event.outcome] ?? event.outcome} {event.status ?? ''}
            </span>
          </div>
          <p className="break-all font-medium">{event.action}</p>
          <p className="break-all text-xs text-muted-foreground">
            Origem: {event.source} ·{' '}
            {event.durationMs === null ? 'Duração não medida' : `${event.durationMs} ms`}
          </p>
          {event.kind === 'operation' ? (
            <p className="text-sm">
              Tentativas HTTP correlacionadas:{' '}
              {String(event.response.restAttempts ?? 'não observado')}
            </p>
          ) : null}
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm">
              Pedido e resposta seguros / correlação
            </summary>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2 text-xs">
              {JSON.stringify(event, null, 2)}
            </pre>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(JSON.stringify(event, null, 2))
                  .catch(() =>
                    setError('Não foi possível copiar. Use os detalhes ou a exportação.'),
                  );
              }}
            >
              Copiar diagnóstico
            </Button>
          </details>
        </Card>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={offset === 0 || busy}
          onClick={() => setOffset((n) => Math.max(0, n - 50))}
        >
          Anterior
        </Button>
        <span className="text-sm">
          {data?.total ? offset + 1 : 0}–{Math.min(offset + 50, data?.total ?? 0)} de{' '}
          {data?.total ?? 0}
        </span>
        <Button
          variant="outline"
          disabled={!data || offset + 50 >= data.total || busy}
          onClick={() => setOffset((n) => n + 50)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}
