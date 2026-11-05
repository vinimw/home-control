/** Web process liveness only. No session, API or provider requests. */
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
