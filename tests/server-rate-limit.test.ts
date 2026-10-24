import assert from 'node:assert/strict';
import test from 'node:test';
import { RateLimiter, createRateLimitMiddleware } from '../server/rateLimit';

test('rate limiter allows requests until max and then rejects', () => {
  const limiter = new RateLimiter({ windowMs: 1000, max: 2, now: () => 1000 });
  assert.equal(limiter.check('ip').allowed, true);
  assert.equal(limiter.check('ip').allowed, true);
  const blocked = limiter.check('ip');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test('rate limiter resets per key and window', () => {
  let now = 1000;
  const limiter = new RateLimiter({ windowMs: 1000, max: 1, now: () => now });
  assert.equal(limiter.check('a').allowed, true);
  assert.equal(limiter.check('a').allowed, false);
  assert.equal(limiter.check('b').allowed, true);
  limiter.reset('a');
  assert.equal(limiter.check('a').allowed, true);
});

test('middleware returns 429 with Retry-After', async () => {
  const middleware = createRateLimitMiddleware({ windowMs: 1000, max: 1, now: () => 1000, keyGenerator: () => 'ip' });
  const headers: Record<string, string> = {};
  const response = {
    set(name: string, value: string) { headers[name] = value; return this; },
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
    statusCode: 200,
    body: null as unknown,
  };
  let nextCalled = false;
  middleware({}, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  middleware({}, response, () => { nextCalled = true; });
  assert.equal(response.statusCode, 429);
  assert.ok(headers['Retry-After']);
});