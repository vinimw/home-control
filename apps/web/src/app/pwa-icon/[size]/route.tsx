import { appIcon } from '@/lib/app-icon';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return [{ size: '192' }, { size: '512' }, { size: 'maskable' }];
}

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (size === '192') return appIcon(192);
  if (size === '512') return appIcon(512);
  if (size === 'maskable') return appIcon(512, true);
  return new Response('Not found', { status: 404 });
}
