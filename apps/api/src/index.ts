import { ConfigError, loadConfig } from './config.js';
import { buildServer } from './server.js';

function readConfig() {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(`${error.message}\nSee .env.example and docs/DEVELOPMENT.md.`);
      process.exit(1);
    }
    throw error;
  }
}

const config = readConfig();
const app = buildServer({ logLevel: config.logLevel, homeAssistant: config.homeAssistant });

app.log.info(
  {
    dataDir: config.dataDir,
    homeAssistant: config.homeAssistant ? 'configured' : 'not configured',
  },
  'configuration loaded',
);

try {
  await app.listen({ port: config.port, host: config.host });
  // Realtime connection retries in the background; the API is usable even if HA is down.
  app.homeAssistant.start();
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    app.close().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
