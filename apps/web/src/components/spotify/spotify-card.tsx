'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, LoaderCircle, Music2, RefreshCw } from 'lucide-react';
import type {
  SpotifyConnectResponse,
  SpotifyDevicesResponse,
  SpotifyPlaybackResponse,
  SpotifyPlaylistsResponse,
  SpotifyStatus,
} from '@home-control/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { spotifyRequest, type SpotifyResult } from '@/lib/spotify-client';

type Outcome = 'connected' | 'denied' | 'error' | undefined;

const OUTCOME_MESSAGE: Record<'connected' | 'denied' | 'error', { text: string; danger: boolean }> =
  {
    connected: { text: 'Spotify conectado.', danger: false },
    denied: { text: 'A conexão foi cancelada no Spotify. Nada foi alterado.', danger: false },
    error: { text: 'Não foi possível concluir a conexão. Tente de novo.', danger: true },
  };

interface Data {
  playlists: SpotifyResult<SpotifyPlaylistsResponse>;
  devices: SpotifyResult<SpotifyDevicesResponse>;
  playback: SpotifyResult<SpotifyPlaybackResponse>;
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p className="flex items-start gap-1.5 text-sm text-foreground" role="alert">
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />
      {message}
    </p>
  );
}

/** Spotify account: connect, see devices and playlists, disconnect. Tokens never reach this component. */
export function SpotifyCard({ outcome }: { outcome: Outcome }) {
  const [status, setStatus] = useState<SpotifyResult<SpotifyStatus> | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    const result = await spotifyRequest<SpotifyStatus>('status');
    setStatus(result);
    if (result.ok && result.data.connected) {
      const [playlists, devices, playback] = await Promise.all([
        spotifyRequest<SpotifyPlaylistsResponse>('playlists'),
        spotifyRequest<SpotifyDevicesResponse>('devices'),
        spotifyRequest<SpotifyPlaybackResponse>('playback'),
      ]);
      setData({ playlists, devices, playback });
      // A request may have found the authorization revoked: show the real state.
      if (
        [playlists, devices, playback].some((r) => !r.ok && r.code === 'spotify_connect_required')
      ) {
        setStatus(await spotifyRequest<SpotifyStatus>('status'));
      }
    } else {
      setData(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function connect() {
    setBusy(true);
    setError(null);
    const result = await spotifyRequest<SpotifyConnectResponse>('connect', 'POST');
    if (result.ok) {
      // Spotify asks the user to approve; it then sends the browser back to the settings page.
      window.location.assign(result.data.authorizeUrl);
      return;
    }
    setBusy(false);
    setError(result.message);
  }

  async function disconnect() {
    setBusy(true);
    const result = await spotifyRequest<null>('disconnect', 'POST');
    setConfirmOpen(false);
    setBusy(false);
    if (result.ok) await load();
    else setError(result.message);
  }

  const s = status?.ok ? status.data : null;
  const note = outcome ? OUTCOME_MESSAGE[outcome] : null;

  return (
    <div className="flex flex-col gap-3">
      {note ? (
        <Alert variant={note.danger ? 'danger' : 'info'}>
          <AlertDescription className="text-foreground">{note.text}</AlertDescription>
        </Alert>
      ) : null}
      {error ? <ErrorLine message={error} /> : null}

      {status === null ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
          Carregando…
        </p>
      ) : !status.ok ? (
        <>
          <ErrorLine message={status.message} />
          <Button variant="outline" className="self-start" onClick={() => void load()}>
            Tentar de novo
          </Button>
        </>
      ) : !s?.configured ? (
        <p className="text-sm text-muted-foreground">
          O Spotify ainda não foi configurado neste servidor. Crie o app no Spotify Developer e
          defina <code>SPOTIFY_CLIENT_ID</code> e <code>SPOTIFY_REDIRECT_URI</code> (passo a passo
          em <code>docs/SPOTIFY.md</code>).
        </p>
      ) : !s.connected ? (
        <>
          {s.reauthRequired ? (
            <Alert variant="warning">
              <CircleAlert aria-hidden />
              <AlertDescription className="text-foreground">
                O acesso ao Spotify terminou (revogado ou expirado). Conecte de novo.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              Conecte sua conta para ver dispositivos e playlists. Só pedimos permissão de leitura.
            </p>
          )}
          <Button
            className="self-start"
            onClick={() => void connect()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : <Music2 aria-hidden />}
            {s.reauthRequired ? 'Conectar de novo' : 'Conectar Spotify'}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium [overflow-wrap:anywhere]">
                {s.account?.displayName ?? s.account?.id}
              </p>
              <p className="text-xs text-muted-foreground">Conta conectada</p>
            </div>
            <Badge variant={s.account?.product === 'premium' ? 'success' : 'warning'}>
              {s.account?.product === 'premium'
                ? 'Premium'
                : `Sem Premium${s.account?.product ? ` (${s.account.product})` : ''}`}
            </Badge>
          </div>
          {s.account?.product !== 'premium' ? (
            <p className="text-sm text-muted-foreground">
              O Spotify só permite controlar a reprodução por aqui com Premium. Ver dispositivos e
              playlists funciona.
            </p>
          ) : null}

          {data?.playback.ok && data.playback.data.playback?.track ? (
            <p className="text-sm">
              <span className="text-muted-foreground">
                {data.playback.data.playback.isPlaying ? 'Tocando agora: ' : 'Pausado: '}
              </span>
              {data.playback.data.playback.track.name} ·{' '}
              {data.playback.data.playback.track.artists.join(', ')}
            </p>
          ) : null}

          <section aria-label="Dispositivos do Spotify" className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Dispositivos
            </h3>
            {data === null ? null : !data.devices.ok ? (
              <ErrorLine message={data.devices.message} />
            ) : data.devices.data.devices.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum dispositivo disponível agora. Abra o Spotify em algum aparelho para ele
                aparecer.
              </p>
            ) : (
              <ul className="divide-y rounded-md border">
                {data.devices.data.devices.map((device) => (
                  <li key={device.id ?? device.name} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">{device.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {device.type}
                        {device.volumePercent !== null ? ` · volume ${device.volumePercent}%` : ''}
                      </p>
                    </div>
                    {device.isActive ? <Badge variant="success">Ativo</Badge> : null}
                    {device.isRestricted ? <Badge variant="warning">Restrito</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Playlists" className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Playlists
            </h3>
            {data === null ? null : !data.playlists.ok ? (
              <ErrorLine message={data.playlists.message} />
            ) : data.playlists.data.playlists.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma playlist encontrada.</p>
            ) : (
              <>
                <ul className="divide-y rounded-md border">
                  {data.playlists.data.playlists.map((playlist) => (
                    <li key={playlist.id} className="px-3 py-2">
                      <p className="text-sm font-medium [overflow-wrap:anywhere]">
                        {playlist.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {playlist.tracks !== null
                          ? `${playlist.tracks} faixas`
                          : 'Faixas indisponíveis'}
                        {playlist.owner ? ` · ${playlist.owner}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
                {data.playlists.data.total > data.playlists.data.playlists.length ? (
                  <p className="text-xs text-muted-foreground">
                    Mostrando {data.playlists.data.playlists.length} de {data.playlists.data.total}.
                  </p>
                ) : null}
              </>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void load()}>
              <RefreshCw aria-hidden />
              Atualizar
            </Button>
            <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={busy}>
              Desconectar
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        destructive
        pending={busy}
        title="Desconectar o Spotify?"
        description="O Home Control esquece a sua conta e apaga as credenciais guardadas aqui. Você pode conectar de novo quando quiser. Para revogar também no Spotify, remova o app em spotify.com/account/apps."
        confirmLabel="Desconectar"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void disconnect()}
      />
    </div>
  );
}
