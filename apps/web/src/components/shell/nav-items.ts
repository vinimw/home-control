import { Clapperboard, House, LayoutGrid, Settings, type LucideIcon } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { href: '/', label: 'Início', icon: House },
  { href: '/devices', label: 'Dispositivos', icon: LayoutGrid },
  { href: '/scenes', label: 'Cenas', icon: Clapperboard },
  { href: '/settings', label: 'Ajustes', icon: Settings },
];

/**
 * Sub-pages that are not in the main navigation. The header shows a back control (top-left, always in
 * reach) that leads to the parent, so "back" never ends up at the bottom of a long page.
 */
export const PARENT_ROUTES: Readonly<
  Record<string, { href: string; label: string; title: string }>
> = {
  '/design': { href: '/settings', label: 'Ajustes', title: 'Componentes' },
};

/** `/` only matches itself; other items also match their sub-routes. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
