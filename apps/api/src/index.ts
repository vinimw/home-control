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
const app = buildServer({ logLevel: config.logLevel });

app.log.info(
  {
    dataDir: config.dataDir,
    homeAssistant: config.homeAssistant ? 'configured' : 'not configured',
  },
  'configuration loaded',
);

try {
  await app.listen({ port: config.port, host: config.host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
