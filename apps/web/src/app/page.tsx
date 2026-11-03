import { API_HEALTH_PATH } from '@home-control/shared';

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>Home Control</h1>
      <p>
        Foundation ready. API health endpoint: <code>{API_HEALTH_PATH}</code>
      </p>
    </main>
  );
}
