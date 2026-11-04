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
  '/devices/custom': { href: '/devices', label: 'Dispositivos', title: 'Cartões' },
  '/echo': { href: '/devices', label: 'Dispositivos', title: 'Echo' },
};

/** Parent of the current path: an exact entry, or a device page (`/devices/<id>`) under Devices. */
export function parentOf(pathname: string): { href: string; label: string } | undefined {
  if (PARENT_ROUTES[pathname]) return PARENT_ROUTES[pathname];
  if (/^\/devices\/[^/]+$/.test(pathname)) return { href: '/devices', label: 'Dispositivos' };
  return undefined;
}

/** `/` only matches itself; other items also match their sub-routes. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
