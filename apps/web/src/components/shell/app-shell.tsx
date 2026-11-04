import type { ReactNode } from 'react';
import { AppHeader } from './app-header';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';

/**
 * Responsive shell: bottom tab bar on phones, sidebar from `md` up.
 * Landmarks (header / nav / main) and a skip link make it keyboard and screen-reader friendly.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>
      <Sidebar />
      <div className="md:pl-60">
        <AppHeader />
        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl px-4 py-4 pb-[calc(5rem+env(safe-area-inset-bottom))] md:py-6 outline-none md:pb-10"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  );
}
