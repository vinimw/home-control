import { ConfigError, loadConfig } from './config.js';
import { join } from 'node:path';
import { buildServer } from './server.js';
import { loadSecretBox } from './spotify/secret-box.js';
import { Storage, StorageError } from './storage/index.js';

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

function openStorage() {
  try {
    return Storage.open(join(config.dataDir, 'home-control.db'));
  } catch (error) {
    if (error instanceof StorageError) {
      console.error(`${error.message}\nData directory: ${config.dataDir}`);
      process.exit(1);
    }
    throw error;
  }
}

const storage = openStorage();
const app = buildServer({
  storage,
  logLevel: config.logLevel,
  homeAssistant: config.homeAssistant,
  deviceRefreshIntervalMs: config.deviceRefreshIntervalMs,
  deviceActions: { enabled: config.deviceActionsEnabled },
  auth: { enabled: config.authEnabled, cookieSecure: config.authCookieSecure },
  spotify: config.spotify ?? undefined,
  secrets: loadSecretBox(config.dataDir, config.appSecretKey),
});

app.log.info(
  {
    dataDir: config.dataDir,
    homeAssistant: config.homeAssistant ? 'configured' : 'not configured',
    deviceActions: config.deviceActionsEnabled ? 'enabled' : 'disabled',
    auth: config.authEnabled ? 'enabled' : 'DISABLED',
    spotify: config.spotify ? 'configured' : 'not configured',
  },
  'configuration loaded',
);
if (!config.authEnabled) {
  app.log.warn(
    'AUTHENTICATION IS DISABLED (AUTH_ENABLED=false): anyone who can reach this API can read and control devices. Development only.',
  );
}
app.auth.purgeExpired();
app.auth.announceSetup();
app.log.info(
  { ...storage.summary(), migrationsApplied: storage.migration.applied },
  'database ready',
);

try {
  await app.listen({ port: config.port, host: config.host });
  // Realtime connection retries in the background; the API is usable even if HA is down.
  app.homeAssistant.start();
  app.devices.start();
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
