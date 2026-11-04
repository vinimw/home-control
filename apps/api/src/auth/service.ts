import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from '@home-control/shared';
import { ApiError } from '../errors.js';
import type { Logger } from '../homeassistant/types.js';
import type { AuthRepository } from '../storage/index.js';
import { hashPassword, verifyPassword } from './password.js';
import { LoginThrottle } from './throttle.js';

export interface AuthServiceOptions {
  /** When false nothing is enforced (local development only; refused in production). */
  enabled: boolean;
  logger: Logger;
  /** A session unused for this long expires. */
  idleTtlMs?: number;
  /** A session never outlives this, however active. */
  absoluteTtlMs?: number;
  clock?: () => number;
}

export interface AuthSession {
  idHash: string;
  csrfToken: string;
  expiresAt: number;
}

export interface IssuedSession {
  /** The secret cookie value. Shown once; only its hash is stored. */
  token: string;
  session: AuthSession;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ambiguous characters (0/O, 1/I/L) are left out so the code can be typed from a log line. */
const SETUP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** Sessions are written back at most this often, to keep sliding expiry cheap. */
const TOUCH_INTERVAL_MS = 60_000;

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

const normalizeCode = (code: string): string => code.replace(/[\s-]/g, '').toUpperCase();

function newSetupCode(): string {
  const bytes = randomBytes(8);
  const chars = Array.from(bytes, (byte) => SETUP_ALPHABET[byte % SETUP_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/** Password policy. Messages name the rule, never the value. */
export function validateNewPassword(password: unknown): string {
  if (typeof password !== 'string') throw new ApiError('invalid_params', 'password: must be text');
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new ApiError(
      'invalid_params',
      `password: must have at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new ApiError(
      'invalid_params',
      `password: must have at most ${MAX_PASSWORD_LENGTH} characters`,
    );
  }
  if (password.trim() === '') {
    throw new ApiError('invalid_params', 'password: must not be only whitespace');
  }
  return password;
}

/**
 * Single-user authentication: one password (scrypt), opaque server-side sessions, a one-time setup code
 * for the first run, and a throttle on guessing.
 */
export class AuthService {
  readonly enabled: boolean;
  private readonly idleTtlMs: number;
  private readonly absoluteTtlMs: number;
  private readonly clock: () => number;
  private readonly throttle: LoginThrottle;
  private setupCode: string | null = null;

  constructor(
    private readonly repo: AuthRepository,
    private readonly options: AuthServiceOptions,
  ) {
    this.enabled = options.enabled;
    this.idleTtlMs = options.idleTtlMs ?? 7 * DAY_MS;
    this.absoluteTtlMs = options.absoluteTtlMs ?? 30 * DAY_MS;
    this.clock = options.clock ?? Date.now;
    this.throttle = new LoginThrottle(5, 30_000, 15 * 60_000, this.clock);
  }

  /** Cookie lifetime in seconds. */
  get cookieMaxAgeSeconds(): number {
    return Math.floor(this.absoluteTtlMs / 1000);
  }

  get configured(): boolean {
    return this.repo.getPasswordHash() !== undefined;
  }

  /**
   * Logs the one-time setup code when no password exists yet. The code is only ever written to the API
   * log (readable by whoever operates the machine), never returned by any endpoint.
   */
  announceSetup(): void {
    if (!this.enabled || this.configured) return;
    this.setupCode ??= newSetupCode();
    this.options.logger.warn(
      { setupCode: this.setupCode },
      'no password set yet: open the web app and create it with this one-time setup code',
    );
  }

  /** Seconds before another password attempt is accepted. */
  retryAfterSeconds(): number {
    return this.throttle.retryAfterSeconds();
  }

  private assertNotThrottled(): void {
    if (this.throttle.retryAfterSeconds() > 0) {
      throw new ApiError('too_many_requests', 'Too many attempts. Try again later.');
    }
  }

  async setup(setupCode: string, password: string): Promise<IssuedSession> {
    this.assertNotThrottled();
    if (this.configured) throw new ApiError('conflict', 'A password has already been created');
    validateNewPassword(password);

    if (!this.setupCode) {
      // The credential was removed while the API was running: a fresh code is needed.
      this.announceSetup();
      throw new ApiError('invalid_credentials', 'Invalid setup code');
    }
    if (!safeEqual(normalizeCode(setupCode), normalizeCode(this.setupCode))) {
      this.throttle.recordFailure();
      this.options.logger.warn({}, 'setup attempt with a wrong code');
      throw new ApiError('invalid_credentials', 'Invalid setup code');
    }

    this.repo.setPasswordHash(await hashPassword(password));
    this.setupCode = null;
    this.throttle.recordSuccess();
    this.options.logger.info({}, 'password created');
    return this.issueSession();
  }

  async login(password: string): Promise<IssuedSession> {
    this.assertNotThrottled();
    const stored = this.repo.getPasswordHash();
    if (!stored) throw new ApiError('setup_required', 'Create a password first');

    // A wrong guess costs exactly what a right one does.
    if (typeof password !== 'string' || !(await verifyPassword(password, stored))) {
      this.throttle.recordFailure();
      this.options.logger.warn({}, 'failed login attempt');
      throw new ApiError('invalid_credentials', 'Wrong password');
    }
    this.throttle.recordSuccess();
    this.options.logger.info({}, 'login');
    return this.issueSession();
  }

  logout(token: string): void {
    this.repo.deleteSession(hashToken(token));
  }

  /** Changing the password ends every other session; the caller keeps theirs. */
  async changePassword(
    currentIdHash: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    this.assertNotThrottled();
    const stored = this.repo.getPasswordHash();
    if (!stored) throw new ApiError('setup_required', 'Create a password first');
    validateNewPassword(newPassword);

    if (!(await verifyPassword(currentPassword, stored))) {
      this.throttle.recordFailure();
      throw new ApiError('invalid_credentials', 'Wrong password');
    }
    this.throttle.recordSuccess();
    this.repo.setPasswordHash(await hashPassword(newPassword));
    const ended = this.repo.deleteSessions(currentIdHash);
    this.options.logger.info({ endedSessions: ended }, 'password changed');
  }

  /** Validates a session cookie value. Returns `null` when missing, unknown or expired. */
  authenticate(token: string | undefined): AuthSession | null {
    if (!token || token.length > 200) return null;
    const idHash = hashToken(token);
    const record = this.repo.getSession(idHash);
    if (!record) return null;

    const nowMs = this.clock();
    const absoluteEnd = Date.parse(record.createdAt) + this.absoluteTtlMs;
    const expiresAt = Date.parse(record.expiresAt);
    if (nowMs >= expiresAt || nowMs >= absoluteEnd) {
      this.repo.deleteSession(idHash);
      return null;
    }

    // Sliding idle expiry, capped by the absolute lifetime.
    if (nowMs - Date.parse(record.lastSeenAt) >= TOUCH_INTERVAL_MS) {
      const next = Math.min(nowMs + this.idleTtlMs, absoluteEnd);
      this.repo.touchSession(idHash, new Date(nowMs).toISOString(), new Date(next).toISOString());
      return { idHash, csrfToken: record.csrfToken, expiresAt: next };
    }
    return { idHash, csrfToken: record.csrfToken, expiresAt };
  }

  /** True while the session still exists (used to close long-lived streams after logout). */
  isActive(idHash: string): boolean {
    const record = this.repo.getSession(idHash);
    return record !== undefined && this.clock() < Date.parse(record.expiresAt);
  }

  purgeExpired(): number {
    return this.repo.purgeExpired(new Date(this.clock()).toISOString());
  }

  private issueSession(): IssuedSession {
    const token = randomBytes(32).toString('base64url');
    const nowMs = this.clock();
    const csrfToken = randomBytes(24).toString('base64url');
    const expiresAt = nowMs + this.idleTtlMs;
    this.repo.createSession({
      idHash: hashToken(token),
      csrfToken,
      createdAt: new Date(nowMs).toISOString(),
      lastSeenAt: new Date(nowMs).toISOString(),
      expiresAt: new Date(expiresAt).toISOString(),
    });
    return { token, session: { idHash: hashToken(token), csrfToken, expiresAt } };
  }
}
