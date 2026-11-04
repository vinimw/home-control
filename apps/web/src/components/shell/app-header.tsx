'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowLeft, House } from 'lucide-react';
import { LogoutButton } from '@/components/auth/logout-button';
import { parentOf } from './nav-items';
import { ThemeToggle } from './theme-toggle';

/**
 * Sticky top bar. On a sub-page the back control sits here, top-left, so it is always in reach instead of
 * at the end of a long page. Phones get a compact bar; the sidebar replaces the brand from `md` up.
 */
export function AppHeader() {
  const pathname = usePathname();
  const parent = parentOf(pathname);

  return (
    <header className="sticky top-0 z-20 border-b bg-background/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-12 max-w-5xl items-center justify-between gap-2 px-2 md:h-14 md:px-4">
        {parent ? (
          <Link
            href={parent.href}
            className="-ml-0.5 flex h-11 min-w-0 items-center gap-1 rounded-md pr-3 pl-2 font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ArrowLeft aria-hidden className="size-5 shrink-0" />
            {/* The visible text ("Ajustes") is contained in the accessible name ("Voltar para Ajustes"). */}
            <span className="truncate">
              <span className="sr-only">Voltar para </span>
              {parent.label}
            </span>
          </Link>
        ) : (
          <span className="flex min-w-0 items-center gap-2 pl-2 font-semibold md:invisible">
            <House aria-hidden className="size-5 shrink-0 text-primary" />
            <span className="truncate">Home Control</span>
          </span>
        )}
        <div className="flex shrink-0 items-center">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
