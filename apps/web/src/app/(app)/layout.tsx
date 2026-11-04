import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { SessionProvider } from '@/components/auth/session-provider';
import { AppShell } from '@/components/shell/app-shell';
import { getSession } from '@/lib/session';

// Every screen in this group needs a session, so it is checked per request.
export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  // The API cannot be reached, so the session cannot be verified: show nothing instead of guessing.
  if (session === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
        <h1 className="text-xl font-semibold">Servidor indisponível</h1>
        <p className="text-sm text-muted-foreground">
          Não foi possível falar com a API. Verifique se ela está em execução e recarregue a página.
        </p>
      </main>
    );
  }
  if (!session.authenticated) redirect('/login');

  return (
    <SessionProvider csrfToken={session.csrfToken}>
      <AppShell>{children}</AppShell>
    </SessionProvider>
  );
}
