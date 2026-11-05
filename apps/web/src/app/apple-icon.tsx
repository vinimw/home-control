import { appIcon } from '@/lib/app-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** iPhone home-screen icon (iOS ignores the manifest icons). */
export default function AppleIcon() {
  return appIcon(180);
}
