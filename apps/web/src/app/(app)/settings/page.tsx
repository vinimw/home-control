import type { Metadata } from 'next';
import Link from 'next/link';
import { SpotifyCard } from '@/components/spotify/spotify-card';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { ThemeSelector } from '@/components/shell/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Ajustes' };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ spotify?: string }>;
}) {
  const { spotify } = await searchParams;
  const outcome =
    spotify === 'connected' || spotify === 'denied' || spotify === 'error' ? spotify : undefined;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Ajustes</h1>

      <Link href="/echo/diagnostics" className="min-h-11 rounded-md border p-3 text-sm">
        Diagnóstico da Alexa
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Aparência</CardTitle>
          <CardDescription>Escolha o tema ou siga a configuração do aparelho.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeSelector />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Segurança</CardTitle>
          <CardDescription>
            Altere a senha. Os outros aparelhos conectados serão desconectados.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spotify</CardTitle>
          <CardDescription>
            Sua conta para ver dispositivos e playlists. Os acessos ficam só no servidor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SpotifyCard outcome={outcome} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Componentes</CardTitle>
          <CardDescription>
            Referência visual dos componentes e dos estados dos controles.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/design">Abrir biblioteca de componentes</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
