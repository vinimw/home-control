import type { ReactNode } from 'react';
import { House } from 'lucide-react';
import { BottomNav } from './bottom-nav';
import { Sidebar } from './sidebar';
import { ThemeToggle } from './theme-toggle';

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
        <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
            <span className="flex items-center gap-2 font-semibold md:invisible">
              <House aria-hidden className="size-5 text-primary" />
              Home Control
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main
          id="conteudo"
          tabIndex={-1}
          className="mx-auto w-full max-w-5xl px-4 py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] outline-none md:pb-10"
        >
          {children}
        </main>
      </div>
      <BottomNav />
    </>
  );
}
