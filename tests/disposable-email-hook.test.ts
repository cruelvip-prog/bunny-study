import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { handleBeforeUserCreated } from '../server/beforeUserCreatedHook';
import { loadDisposableEmailDomains } from '../server/disposableEmail';
import { createRateLimitMiddleware } from '../server/rateLimit';
import { verifyStandardWebhook } from '../server/webhookVerification';

class MockResponse {
  statusCode = 200;
  body: unknown = null;
  headers: Record<string, string> = {};

  status(code: number) {
    this.statusCode = code;
    return this;
  }

  set(name: string, value: string) {
    this.headers[name] = value;
    return this;
  }

  json(body: unknown) {
    this.body = body;
    return this;
  }
}

function withEnvironment<T>(values: Record<string, string | undefined>, run: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  try {
    return run();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
}

test('production rejects unsigned hook requests when the secret is missing', () => {
  const request = {
    rawBody: Buffer.from(JSON.stringify({ user: { email: 'person@mailinator.com' } })),
    headers: {},
  } as any;
  const response = new MockResponse() as any;

  withEnvironment({
    NODE_ENV: 'production',
    OINKIE_BEFORE_USER_CREATED_HOOK_SECRET: undefined,
    BEFORE_USER_CREATED_HOOK_SECRET: undefined,
  }, () => {
    handleBeforeUserCreated(request, response);
  });

  assert.equal(response.statusCode, 500);
  assert.equal((response.body as any).error.http_code, 500);
});

test('missing raw body is rejected instead of reconstructed', () => {
  const request = { headers: {} } as any;
  const response = new MockResponse() as any;

  withEnvironment({
    NODE_ENV: 'test',
    OINKIE_BEFORE_USER_CREATED_HOOK_SECRET: undefined,
    BEFORE_USER_CREATED_HOOK_SECRET: undefined,
  }, () => {
    handleBeforeUserCreated(request, response);
  });

  assert.equal(response.statusCode, 400);
  assert.equal((response.body as any).error.http_code, 400);
});

test('invalid, expired, and malformed hook signatures are rejected', () => {
  const secret = 'v1,whsec_' + Buffer.from('test-secret').toString('base64');
  const body = Buffer.from(JSON.stringify({ user: { email: 'person@gmail.com' } }));
  const now = Math.floor(Date.now() / 1000);

  const cases = [
    {
      headers: {
        'webhook-id': 'id',
        'webhook-timestamp': String(now),
        'webhook-signature': 'v1,invalid-signature',
      },
    },
    {
      headers: {
        'webhook-id': 'id',
        'webhook-timestamp': String(now - 10 * 60),
        'webhook-signature': (() => {
          const signedContent = `id.${now - 10 * 60}.${body.toString('utf8')}`;
          const key = Buffer.from(secret.replace('v1,whsec_', ''), 'base64');
          return 'v1,' + crypto.createHmac('sha256', key).update(signedContent).digest('base64');
        })(),
      },
    },
    {
      headers: {},
    },
  ];

  for (const testCase of cases) {
    const request = { rawBody: body, headers: testCase.headers } as any;
    const response = new MockResponse() as any;

    withEnvironment({
      NODE_ENV: 'test',
      OINKIE_BEFORE_USER_CREATED_HOOK_SECRET: secret,
      BEFORE_USER_CREATED_HOOK_SECRET: undefined,
    }, () => {
      handleBeforeUserCreated(request, response);
    });

    assert.equal(response.statusCode, 400, JSON.stringify(testCase.headers));
  }
});

test('auth-hook rate limiter uses an authentication-specific message', () => {
  const middleware = createRateLimitMiddleware({
    windowMs: 1000,
    max: 1,
    now: () => 1000,
    keyGenerator: () => 'ip',
    message: 'Too many authentication requests. Please try again later.',
  });
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
  assert.equal((response.body as any).error.message, 'Too many authentication requests. Please try again later.');
});

test('built deployment layout can load the full blocklist', { skip: !fs.existsSync(path.join(process.cwd(), 'dist-server', 'data', 'disposable-email-domains.txt')) }, () => {
  const result = loadDisposableEmailDomains(path.join(process.cwd(), 'dist-server', 'data', 'disposable-email-domains.txt'));
  assert.equal(result.source, 'file');
  assert.ok(result.domains.size > 1000);
});

test('built server rejects oversized hook requests', { skip: !fs.existsSync(path.join(process.cwd(), 'dist-server', 'server.js')) }, async () => {
  const port = '3999';
  const server = spawn(process.execPath, [path.join(process.cwd(), 'dist-server', 'server.js')], {
    env: {
      ...process.env,
      PORT: port,
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timed out waiting for server startup.')), 10000);
      server.stdout?.on('data', (chunk: Buffer) => {
        if (chunk.toString().includes('listening')) {
          clearTimeout(timeout);
          resolve();
        }
      });
      server.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Server exited early with code ${code}.`));
      });
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/auth/before-user-created`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: { email: 'person@gmail.com' }, padding: 'x'.repeat(1_100_000) }),
    });

    assert.equal(response.status, 413);
  } finally {
    server.kill();
    await new Promise((resolve) => server.on('exit', resolve));
  }
});
