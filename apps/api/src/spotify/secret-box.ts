import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KEY_BYTES = 32;
const KEY_FILE = 'app-secret.key';

/**
 * Encrypts small secrets (OAuth tokens) at rest with AES-256-GCM. The key is NOT in the database, so a copy
 * of the database file alone reveals nothing. Format: `v1.<iv>.<tag>.<ciphertext>` (base64url).
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== KEY_BYTES) throw new Error(`The secret key must be ${KEY_BYTES} bytes.`);
  }

  static random(): SecretBox {
    return new SecretBox(randomBytes(KEY_BYTES));
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return ['v1', iv, tag, data]
      .map((part) => (Buffer.isBuffer(part) ? part.toString('base64url') : part))
      .join('.');
  }

  /** Throws when the value was tampered with or encrypted with another key. */
  decrypt(stored: string): string {
    const [version, iv, tag, data] = stored.split('.');
    if (version !== 'v1' || !iv || !tag || data === undefined)
      throw new Error('Unreadable secret.');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}

/**
 * The key comes from `APP_SECRET_KEY` (base64, 32 bytes) when set; otherwise a random key is created once in
 * `<dataDir>/app-secret.key` (mode 0600) and reused. Losing the key only means reconnecting Spotify.
 */
export function loadSecretBox(dataDir: string, fromEnv?: string): SecretBox {
  if (fromEnv) return new SecretBox(Buffer.from(fromEnv, 'base64'));

  mkdirSync(dataDir, { recursive: true });
  const file = join(dataDir, KEY_FILE);
  if (existsSync(file)) {
    return new SecretBox(Buffer.from(readFileSync(file, 'utf8').trim(), 'base64'));
  }
  const key = randomBytes(KEY_BYTES);
  writeFileSync(file, key.toString('base64'), { mode: 0o600, flag: 'wx' });
  chmodSync(file, 0o600);
  return new SecretBox(key);
}
