export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  now?: () => number;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export class RateLimiter {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly now: () => number;
  private readonly message: string;
  private readonly hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    if (!Number.isFinite(options.windowMs) || options.windowMs <= 0) {
      throw new Error('windowMs must be a positive number.');
    }
    if (!Number.isFinite(options.max) || options.max <= 0) {
      throw new Error('max must be a positive number.');
    }
    this.windowMs = options.windowMs;
    this.max = options.max;
    this.now = options.now ?? (() => Date.now());
    this.message = options.message ?? 'Too many requests. Please try again later.';
  }

  check(key: string): RateLimitResult {
    const now = this.now();
    const cutoff = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.max) {
      const oldest = recent[0];
      const retryAfterMs = Math.max(0, this.windowMs - (now - oldest));
      this.hits.set(key, recent);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return {
      allowed: true,
      remaining: Math.max(0, this.max - recent.length),
      retryAfterSeconds: 0,
    };
  }

  reset(key?: string): void {
    if (key === undefined) this.hits.clear();
    else this.hits.delete(key);
  }
}

export function createRateLimitMiddleware(options: RateLimiterOptions & { keyGenerator?: (request: any) => string }) {
  const limiter = new RateLimiter(options);
  const keyGenerator = options.keyGenerator ?? ((request: any) => request.socket?.remoteAddress || 'unknown');
  const message = options.message ?? 'Too many admin requests. Please try again later.';
  return (request: any, response: any, next: any) => {
    const key = keyGenerator(request);
    const result = limiter.check(key);
    response.set('X-RateLimit-Limit', String(options.max));
    response.set('X-RateLimit-Remaining', String(result.remaining));
    if (!result.allowed) {
      response.set('Retry-After', String(result.retryAfterSeconds));
      response.status(429).json({
        error: {
          message,
          code: 'rate_limited',
        },
      });
      return;
    }
    next();
  };
}
