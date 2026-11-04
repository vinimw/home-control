/**
 * Operator tool, run on the machine that hosts the API:
 *
 *   node dist/auth-cli.js reset-password
 *
 * Removes the password and every session. After restarting the API, a new one-time setup code is printed
 * in its log and the web app asks for a new password. Nothing here is reachable over the network.
 */
import { join } from 'node:path';
import { ConfigError, loadConfig } from './config.js';
import { Storage, StorageError } from './storage/index.js';

const command = process.argv[2];
if (command !== 'reset-password') {
  console.error('Usage: auth-cli reset-password');
  process.exit(command === undefined || command === '--help' ? 0 : 1);
}

try {
  const config = loadConfig();
  const storage = Storage.open(join(config.dataDir, 'home-control.db'));
  storage.auth.clearCredential();
  storage.close();
  console.log(
    'Password and sessions removed. Restart the API: it will print a new one-time setup code in its log.',
  );
} catch (error) {
  if (error instanceof ConfigError || error instanceof StorageError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
