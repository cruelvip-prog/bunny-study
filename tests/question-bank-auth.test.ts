import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import type { Server } from 'node:http';
import { verifyMainAdminSession } from '../server/auth';
import { AdminApiError } from '../server/errors';
import { createAdminQuestionBankRouter } from '../server/adminQuestionRouter';
import type { QuestionBankAdminService } from '../server/questionBankService';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('main-project authorization verifies the session and calls is_admin with the user token', async () => {
  const calls: Array<{ url: string; authorization: string | null; body: string | null }> = [];
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      authorization: new Headers(init?.headers).get('authorization'),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: 'admin-user-id' });
    if (url.endsWith('/rest/v1/rpc/is_admin')) return jsonResponse(true);
    throw new Error(`Unexpected URL ${url}`);
  };

  const identity = await verifyMainAdminSession(
    'access-token',
    { url: 'https://main.example.test', publishableKey: 'publishable-key' },
    fetchMock as typeof fetch,
  );

  assert.deepEqual(identity, { userId: 'admin-user-id' });
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.url.startsWith('https://main.example.test/')));
  assert.ok(calls.every((call) => call.authorization === 'Bearer access-token'));
  assert.equal(calls[1].body, '{}');
});

test('non-admin, invalid sessions, and missing tokens fail closed', async () => {
  const config = { url: 'https://main.example.test', publishableKey: 'publishable-key' };
  const nonAdminFetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) return jsonResponse({ id: 'ordinary-user' });
    return jsonResponse(false);
  };

  await assert.rejects(
    verifyMainAdminSession('token', config, nonAdminFetch as typeof fetch),
    (error: unknown) => error instanceof AdminApiError && error.status === 403 && error.code === 'not_admin',
  );

  const expiredFetch = async () => jsonResponse({ message: 'invalid token' }, 401);
  await assert.rejects(
    verifyMainAdminSession('expired-token', config, expiredFetch as typeof fetch),
    (error: unknown) => error instanceof AdminApiError && error.status === 401,
  );

  let called = false;
  const unusedFetch = async () => {
    called = true;
    return jsonResponse(true);
  };
  await assert.rejects(
    verifyMainAdminSession('', config, unusedFetch as typeof fetch),
    (error: unknown) => error instanceof AdminApiError && error.status === 401 && error.code === 'missing_session',
  );
  assert.equal(called, false);
});

test('the admin router rejects writes before the service when authorization fails', async () => {
  let serviceCalls = 0;
  let authorizeCalls = 0;
  const fakeService = {
    async statuses() {
      serviceCalls += 1;
      return [];
    },
  } as unknown as QuestionBankAdminService;

  const router = createAdminQuestionBankRouter({
    service: fakeService,
    authorize: async () => {
      authorizeCalls += 1;
      throw new AdminApiError(403, 'This account is not authorized.', 'not_admin');
    },
  });
  const app = express();
  app.use(express.json());
  app.use('/api/admin/question-banks', router);
  const server = await new Promise<Server>((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/admin/question-banks`;

  try {
    const writeResponse = await fetch(`${baseUrl}/physics/questions`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ordinary-user-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        table: 'physics_questions',
        question: { chapter: 'Should never be written' },
      }),
    });
    assert.equal(writeResponse.status, 403);
    const errorBody = await writeResponse.json() as { error?: { code?: string } };
    assert.equal(errorBody.error?.code, 'not_admin');
    assert.equal(serviceCalls, 0);
    assert.equal(authorizeCalls, 1);

    const anonymousResponse = await fetch(`${baseUrl}/status`);
    assert.equal(anonymousResponse.status, 401);
    assert.equal(serviceCalls, 0);
    assert.equal(authorizeCalls, 1);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
});
