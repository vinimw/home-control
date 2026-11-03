import { ConfigError, loadConfig } from './config.js';

// Validates the current environment (loaded from .env by the npm script).
// Home Assistant is required here: this is the pre-flight check before enabling the integration.
try {
  const config = loadConfig(process.env, { requireHomeAssistant: true });
  console.log('Configuration OK');
  console.log(`  API:            ${config.host}:${config.port}`);
  console.log(`  Data directory: ${config.dataDir}`);
  console.log(`  Home Assistant: ${config.homeAssistant?.url} (token set)`);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
