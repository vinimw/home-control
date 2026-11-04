import type { Metadata } from 'next';
import Link from 'next/link';
import { ChangePasswordForm } from '@/components/auth/change-password-form';
import { ThemeSelector } from '@/components/shell/theme-toggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Ajustes' };

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>

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
