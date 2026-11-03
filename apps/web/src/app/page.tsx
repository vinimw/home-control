import { API_HEALTH_PATH, type HealthResponse } from '@home-control/shared';
import { env } from '../lib/env';

// Rendered per request so the API status is always fresh.
export const dynamic = 'force-dynamic';

async function getApiHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${env.API_INTERNAL_URL}${API_HEALTH_PATH}`, {
      cache: 'no-store',
    });
    return response.ok ? ((await response.json()) as HealthResponse) : null;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await getApiHealth();

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Home Control</h1>
      <p>
        API status: <strong>{health ? health.status : 'unreachable'}</strong>
      </p>
    </main>
  );
}
