import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { getSession } from '@/lib/session';

export const metadata: Metadata = { title: 'Entrar' };
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await getSession();

  if (session === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] text-center">
        <h1 className="text-xl font-semibold">Servidor indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Não foi possível falar com a API. Verifique se ela está em execução e recarregue a página.
        </p>
      </main>
    );
  }
  if (session.authenticated) redirect('/');

  return <LoginForm configured={session.configured} />;
}
