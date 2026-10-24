import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAIN_PROJECT_PUBLISHABLE_KEY_ENV,
  MAIN_PROJECT_URL_ENV,
  getMainProjectServerConfig,
  getRemoteProjectServerConfig,
} from '../server/config';
import { requireQuestionBankSource } from '../src/questionBanks/sourceRegistry';
import { SupabaseQuestionBankRepository } from '../server/questionBankRepository';

test('main-project server config requires only the URL and publishable key', () => {
  assert.throws(
    () => getMainProjectServerConfig({}),
    (error: unknown) => error instanceof Error
      && error.message.includes(MAIN_PROJECT_URL_ENV)
      && error.message.includes(MAIN_PROJECT_PUBLISHABLE_KEY_ENV),
  );

  const config = getMainProjectServerConfig({
    [MAIN_PROJECT_URL_ENV]: 'https://main.example.test/',
    [MAIN_PROJECT_PUBLISHABLE_KEY_ENV]: 'publishable-key',
  });
  assert.deepEqual(config, {
    url: 'https://main.example.test',
    publishableKey: 'publishable-key',
  });
  assert.throws(
    () => getMainProjectServerConfig({
      [MAIN_PROJECT_URL_ENV]: 'javascript:alert(1)',
      [MAIN_PROJECT_PUBLISHABLE_KEY_ENV]: 'publishable-key',
    }),
    /must use HTTP or HTTPS/,
  );
});

test('each remote project has its own server-only URL and service-role names', () => {
  const chemistry = requireQuestionBankSource('chemistry');
  const missing = getRemoteProjectServerConfig(chemistry, {});
  assert.equal(missing.url, null);
  assert.equal(missing.serviceRoleKey, null);
  assert.match(missing.error ?? '', /OINKIE_CHEMISTRY_SUPABASE_URL/);
  assert.match(missing.error ?? '', /OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY/);

  const configured = getRemoteProjectServerConfig(chemistry, {
    OINKIE_CHEMISTRY_SUPABASE_URL: 'https://chemistry.example.test/',
    OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
  });
  assert.deepEqual(configured, {
    source: chemistry,
    url: 'https://chemistry.example.test',
    serviceRoleKey: 'server-only-key',
    error: null,
  });

  const invalid = getRemoteProjectServerConfig(chemistry, {
    OINKIE_CHEMISTRY_SUPABASE_URL: 'not a URL',
    OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY: 'server-only-key',
  });
  assert.equal(invalid.url, null);
  assert.match(invalid.error ?? '', /invalid project URL/);
});

test('a missing source configuration is reported as invalid configuration, never as a zero count', async () => {
  const repository = new SupabaseQuestionBankRepository({});
  const chemistry = requireQuestionBankSource('chemistry');
  const status = await repository.status(chemistry);
  assert.equal(status.state, 'invalid-configuration');
  assert.equal(status.count, null);
  assert.match(status.detail, /OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY/);
});
