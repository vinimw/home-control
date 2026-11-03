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

/** `/` only matches itself; other items also match their sub-routes. */
export function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}
