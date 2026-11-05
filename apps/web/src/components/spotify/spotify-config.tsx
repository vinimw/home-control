'use client';

import { useId, useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Copy,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import {
  SPOTIFY_CALLBACK_PATH,
  SPOTIFY_CLIENT_ID_PATTERN,
  spotifyRedirectUriProblem,
  type SpotifyConfigResponse,
  type SpotifyStatus,
  type SpotifyTestCheck,
  type SpotifyTestResult,
} from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { spotifyRequest } from '@/lib/spotify-client';

const CHECK_ICON: Record<SpotifyTestCheck['status'], typeof CircleCheck> = {
  ok: CircleCheck,
  warning: TriangleAlert,
  failed: CircleAlert,
  skipped: CircleDashed,
};
const CHECK_COLOR: Record<SpotifyTestCheck['status'], string> = {
  ok: 'text-success',
  warning: 'text-warning',
  failed: 'text-destructive',
  skipped: 'text-muted-foreground',
};

const SOURCE_LABEL = { saved: 'Salvo no app', environment: 'Do servidor (.env)' } as const;

/** The callback Spotify must be told about, derived from the address this page is opened on. */
function suggestedCallback(): string {
  return typeof window === 'undefined'
    ? SPOTIFY_CALLBACK_PATH
    : `${window.location.origin}${SPOTIFY_CALLBACK_PATH}`;
}

interface Props {
  status: SpotifyStatus;
  /** Called with the new status after the registration changed. */
  onChanged: (status: SpotifyStatus, connectionReset: boolean) => void;
}

/** Saves the Spotify app registration (Client ID + callback), explains what to register and tests it. */
export function SpotifyConfigForm({ status, onChanged }: Props) {
  const id = useId();
  const config = status.config;
  const [clientId, setClientId] = useState(config.clientId ?? '');
  const [redirectUri, setRedirectUri] = useState(config.redirectUri ?? suggestedCallback());
  const [busy, setBusy] = useState<'save' | 'reset' | 'test' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [test, setTest] = useState<SpotifyTestResult | null>(null);
  const [copied, setCopied] = useState(false);

  const idProblem =
    clientId.trim() !== '' && !SPOTIFY_CLIENT_ID_PATTERN.test(clientId.trim())
      ? 'O Client ID tem 32 caracteres hexadecimais. Copie-o do Dashboard do Spotify.'
      : null;
  const uriProblem =
    redirectUri.trim() !== '' ? spotifyRedirectUriProblem(redirectUri.trim()) : null;
  const here = suggestedCallback();
  const hereProblem = spotifyRedirectUriProblem(here);
  const dirty =
    clientId.trim() !== (config.clientId ?? '') ||
    redirectUri.trim() !== (config.redirectUri ?? '');
  const canSave =
    !busy &&
    !idProblem &&
    !uriProblem &&
    clientId.trim() !== '' &&
    redirectUri.trim() !== '' &&
    dirty;

  async function save() {
    setBusy('save');
    setError(null);
    setNotice(null);
    setTest(null);
    const result = await spotifyRequest<SpotifyConfigResponse>('config', 'PUT', {
      clientId: clientId.trim(),
      redirectUri: redirectUri.trim(),
    });
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setNotice(
      result.data.connectionReset
        ? 'Configuração salva. Como o Client ID mudou, a conta foi desconectada: conecte de novo.'
        : 'Configuração salva.',
    );
    onChanged(result.data.status, result.data.connectionReset);
  }

  async function useEnvironment() {
    setBusy('reset');
    setError(null);
    setNotice(null);
    setTest(null);
    const result = await spotifyRequest<SpotifyConfigResponse>('config', 'DELETE');
    setBusy(null);
    if (!result.ok) return setError(result.message);
    setClientId(result.data.status.config.clientId ?? '');
    setRedirectUri(result.data.status.config.redirectUri ?? suggestedCallback());
    setNotice(
      result.data.connectionReset
        ? 'Voltou à configuração do servidor. A conta foi desconectada: conecte de novo.'
        : 'Voltou à configuração do servidor.',
    );
    onChanged(result.data.status, result.data.connectionReset);
  }

  async function runTest() {
    setBusy('test');
    setError(null);
    const result = await spotifyRequest<SpotifyTestResult>('test', 'POST');
    setBusy(null);
    if (result.ok) setTest(result.data);
    else setError(result.message);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(redirectUri.trim() || here);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable (plain http): the field can be selected by hand */
    }
  }

  return (
    <section aria-label="Aplicativo do Spotify" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Aplicativo do Spotify
        </h3>
        <Badge variant={config.source ? 'success' : 'warning'}>
          {config.source ? SOURCE_LABEL[config.source] : 'Não configurado'}
        </Badge>
      </div>

      <ol className="list-decimal pl-5 text-sm text-muted-foreground">
        <li>
          Em <code>developer.spotify.com/dashboard</code>, crie um app (Web API).
        </li>
        <li>
          Em <strong>Redirect URIs</strong>, cadastre <strong>exatamente</strong> o callback abaixo.
        </li>
        <li>
          Em modo de desenvolvimento, adicione sua conta em <strong>User Management</strong>.
        </li>
        <li>Cole o Client ID aqui. Não existe segredo: usamos PKCE.</li>
      </ol>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-client`} className="text-sm font-medium">
          Client ID
        </label>
        <Input
          id={`${id}-client`}
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={idProblem !== null}
          aria-describedby={idProblem ? `${id}-client-err` : undefined}
        />
        {idProblem ? (
          <p id={`${id}-client-err`} className="text-xs text-destructive" role="alert">
            {idProblem}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-uri`} className="text-sm font-medium">
          Callback (Redirect URI)
        </label>
        <div className="flex gap-2">
          <Input
            id={`${id}-uri`}
            value={redirectUri}
            onChange={(event) => setRedirectUri(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={uriProblem !== null}
            aria-describedby={`${id}-uri-help`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copiar o callback"
            onClick={() => void copy()}
          >
            <Copy aria-hidden />
          </Button>
        </div>
        <p
          id={`${id}-uri-help`}
          className="text-xs text-muted-foreground"
          role={uriProblem ? 'alert' : undefined}
        >
          {uriProblem ??
            (copied
              ? 'Copiado.'
              : 'Cadastre este valor no Dashboard do Spotify, idêntico, caractere por caractere.')}
        </p>
        {hereProblem && redirectUri.trim() === here ? null : hereProblem ? (
          <p className="text-xs text-muted-foreground">
            Você abriu o app em <code>{here.replace(SPOTIFY_CALLBACK_PATH, '')}</code>, que o
            Spotify não aceita como callback. Use um endereço https, ou conecte uma vez pelo próprio
            computador em <code>http://127.0.0.1:3000</code>.
          </p>
        ) : null}
      </div>

      {error ? (
        <Alert variant="danger">
          <CircleAlert aria-hidden />
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <p className="text-sm" role="status">
          {notice}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={!canSave} aria-busy={busy === 'save'}>
          {busy === 'save' ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          Salvar
        </Button>
        {config.source === 'saved' && config.environmentAvailable ? (
          <Button variant="outline" onClick={() => void useEnvironment()} disabled={busy !== null}>
            Usar a configuração do servidor
          </Button>
        ) : null}
        <Button
          variant="outline"
          onClick={() => void runTest()}
          disabled={busy !== null || !config.source}
          aria-busy={busy === 'test'}
        >
          {busy === 'test' ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          Testar conexão
        </Button>
      </div>

      {test ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Resultado do teste">
          <p className="text-sm font-medium">
            {test.ok ? 'Tudo certo com a conexão.' : 'O teste encontrou problemas.'}
            <span className="font-normal text-muted-foreground">
              {' '}
              (somente leitura; nada foi alterado)
            </span>
          </p>
          <ul className="divide-y rounded-md border">
            {test.checks.map((check) => {
              const Icon = CHECK_ICON[check.status];
              return (
                <li key={check.id} className="flex items-start gap-2 px-3 py-2">
                  <Icon
                    aria-hidden
                    className={`mt-0.5 size-4 shrink-0 ${CHECK_COLOR[check.status]}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{check.label}</p>
                    <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {check.message}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
