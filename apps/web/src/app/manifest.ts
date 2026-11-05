import type { MetadataRoute } from 'next';

/**
 * Makes the app installable on the home screen. There is deliberately no service worker and no offline
 * cache: the app only controls devices while it can reach the server, and says so when it cannot.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Home Control',
    short_name: 'Home Control',
    description: 'Controle local da sua casa: TV, Echo Show e música.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/pwa-icon/192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/pwa-icon/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
