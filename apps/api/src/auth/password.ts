import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt (memory-hard, built into Node, no native module).
 * Stored as `scrypt$N$r$p$salt$hash` so the cost can be raised later without breaking old hashes.
 */
const N = 32768; // 2^15
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs 128 * N * r bytes (32 MiB here); leave headroom above that.
const MAX_MEMORY = 128 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  const options: ScryptOptions = { N: n, r, p, maxmem: MAX_MEMORY };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Constant-time comparison. Malformed stored hashes simply fail to verify. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const params = [Number(n), Number(r), Number(p)];
  if (params.some((value) => !Number.isInteger(value) || value <= 0)) return false;
  try {
    const expected = Buffer.from(hash, 'base64url');
    const actual = await derive(
      password,
      Buffer.from(salt, 'base64url'),
      params[0]!,
      params[1]!,
      params[2]!,
    );
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
