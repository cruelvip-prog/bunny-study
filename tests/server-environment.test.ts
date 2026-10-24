import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  getMainProjectServerConfig,
  getRemoteProjectServerConfig,
} from '../server/config';
import { loadServerEnvironment } from '../server/loadServerEnvironment';
import { requireQuestionBankSource } from '../src/questionBanks/sourceRegistry';

test('server entrypoint loads the environment bootstrap before configuration imports', () => {
  const source = readFileSync(
    new URL('../server/index.ts', import.meta.url),
    'utf8',
  );
  const environmentImport = source.indexOf("from './environment'");
  const configImport = source.indexOf("from './config'");

  assert.ok(environmentImport >= 0, 'server entrypoint must import the environment bootstrap');
  assert.ok(configImport >= 0, 'server entrypoint must import server configuration');
  assert.ok(
    environmentImport < configImport,
    'environment loading must be imported before server configuration',
  );
});

test('Chemistry admin requires the server-only service-role variable', () => {
  const chemistry = getRemoteProjectServerConfig(
    requireQuestionBankSource('chemistry'),
    {
      OINKIE_CHEMISTRY_SUPABASE_URL: 'https://chemistry.example.test',
      OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY: '   ',
      VITE_SUPABASE_CHEMISTRY_PUBLISHABLE_KEY: 'test-publishable-key',
    },
  );

  assert.equal(chemistry.url, null);
  assert.equal(chemistry.serviceRoleKey, null);
  assert.match(
    chemistry.error ?? '',
    /OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY/,
  );
});

test('server env loading happens before main and Chemistry config validation', () => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'oinkie-server-env-'));
  try {
    writeFileSync(
      path.join(projectRoot, '.env.server'),
      [
        'OINKIE_MAIN_SUPABASE_URL=https://main.example.test',
        'OINKIE_MAIN_SUPABASE_PUBLISHABLE_KEY=test-main-publishable-key',
        'OINKIE_CHEMISTRY_SUPABASE_URL=https://chemistry.example.test',
        'OINKIE_CHEMISTRY_SUPABASE_SERVICE_ROLE_KEY=test-chemistry-service-key',
      ].join('\n'),
    );
    writeFileSync(
      path.join(projectRoot, '.env'),
      [
        'OINKIE_MAIN_SUPABASE_URL=https://fallback.example.test',
        'FALLBACK_ONLY=present',
      ].join('\n'),
    );

    const environment: Record<string, string | undefined> = {};
    const loaded = loadServerEnvironment({ projectRoot, environment });

    assert.deepEqual(
      loaded.loadedFiles.map((file) => path.basename(file)),
      ['.env.server', '.env'],
    );
    assert.equal(environment.OINKIE_MAIN_SUPABASE_URL, 'https://main.example.test');
    assert.equal(environment.FALLBACK_ONLY, 'present');

    const mainConfig = getMainProjectServerConfig(environment);
    assert.deepEqual(mainConfig, {
      url: 'https://main.example.test',
      publishableKey: 'test-main-publishable-key',
    });

    const chemistry = getRemoteProjectServerConfig(
      requireQuestionBankSource('chemistry'),
      environment,
    );
    assert.equal(chemistry.error, null);
    assert.equal(chemistry.url, 'https://chemistry.example.test');
    assert.equal(chemistry.serviceRoleKey, 'test-chemistry-service-key');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
