/**
 * Slows down password guessing. The API sits behind the web app, so every request arrives from the same
 * address: the limit is therefore global rather than per client. That trades a small lock-out risk for
 * the owner during an attack against a hard stop for the attacker. A successful login resets it.
 */
export class LoginThrottle {
  private failures = 0;
  private lockedUntil = 0;

  constructor(
    private readonly freeAttempts = 5,
    private readonly baseLockMs = 30_000,
    private readonly maxLockMs = 15 * 60_000,
    private readonly clock: () => number = Date.now,
  ) {}

  /** Seconds to wait before another attempt is accepted, or 0 when attempts are allowed. */
  retryAfterSeconds(): number {
    return Math.max(0, Math.ceil((this.lockedUntil - this.clock()) / 1000));
  }

  recordFailure(): void {
    this.failures += 1;
    const over = this.failures - this.freeAttempts;
    if (over >= 0) {
      this.lockedUntil = this.clock() + Math.min(this.baseLockMs * 2 ** over, this.maxLockMs);
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }
}

/** Fixed-window counter per key (used per session for state-changing requests). */
export class WindowLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly clock: () => number = Date.now,
    private readonly maxKeys = 1000,
  ) {}

  /** True when the request is allowed. */
  take(key: string): boolean {
    const nowMs = this.clock();
    const current = this.windows.get(key);
    if (!current || nowMs - current.start >= this.windowMs) {
      if (this.windows.size >= this.maxKeys) this.prune(nowMs);
      this.windows.set(key, { start: nowMs, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= this.limit;
  }

  private prune(nowMs: number): void {
    for (const [key, window] of this.windows) {
      if (nowMs - window.start >= this.windowMs) this.windows.delete(key);
    }
    // Still full of live windows: drop the oldest so memory stays bounded.
    while (this.windows.size >= this.maxKeys) {
      const oldest = this.windows.keys().next().value;
      if (oldest === undefined) break;
      this.windows.delete(oldest);
    }
  }
}
