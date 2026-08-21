import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  findUnsafePublicEnvironment,
  readExpoBuildEnvironment,
} from './public-env-guard.mjs';

function legacyJwt(role) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role })).toString('base64url');
  return `${header}.${payload}.signature`;
}

test('allows current publishable and legacy anon keys in Expo public variables', () => {
  assert.deepEqual(findUnsafePublicEnvironment({
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_browser-safe',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: legacyJwt('anon'),
    EXPO_PUBLIC_WEB_APP_URL: 'https://riskradar.example',
  }), []);
});

test('blocks modern backend secrets from every Expo public variable', () => {
  const secret = ['sb', 'secret', 'do-not-bundle-this-value'].join('_');
  const problems = findUnsafePublicEnvironment({
    EXPO_PUBLIC_ACCIDENTAL_VALUE: secret,
  });

  assert.equal(problems.length, 1);
  assert.equal(problems[0].key, 'EXPO_PUBLIC_ACCIDENTAL_VALUE');
  assert.equal(problems[0].message.includes(secret), false);
});

test('blocks Stripe and legacy service-role secrets from Expo public variables', () => {
  const problems = findUnsafePublicEnvironment({
    EXPO_PUBLIC_STRIPE_VALUE: ['sk', 'live', 'do-not-bundle-this-value'].join('_'),
    EXPO_PUBLIC_SUPABASE_ANON_KEY: legacyJwt('service_role'),
  });

  assert.deepEqual(problems.map((problem) => problem.key), [
    'EXPO_PUBLIC_STRIPE_VALUE',
    'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ]);
});

test('blocks an opaque backend credential copied into an Expo public variable', () => {
  const opaqueSecret = 'opaque-database-password-without-a-known-prefix';
  const problems = findUnsafePublicEnvironment({
    SUPABASE_DB_PASSWORD: opaqueSecret,
    EXPO_PUBLIC_ACCIDENTAL_VALUE: opaqueSecret,
  });

  assert.deepEqual(problems.map((problem) => problem.key), [
    'EXPO_PUBLIC_ACCIDENTAL_VALUE',
  ]);
});

test('reads the same project dotenv files that Expo reads before export', async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'riskradar-public-env-'));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const secret = ['sb', 'secret', 'dotenv-value-must-be-blocked'].join('_');
  await writeFile(
    path.join(projectRoot, '.env'),
    `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${secret}\n`,
  );

  const environment = readExpoBuildEnvironment(projectRoot, {
    NODE_ENV: 'development',
  });
  const problems = findUnsafePublicEnvironment(environment);

  assert.deepEqual(problems.map((problem) => problem.key), [
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  ]);
});

test('checks production dotenv files when export starts without NODE_ENV', async (t) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'riskradar-production-env-'));
  t.after(() => rm(projectRoot, { recursive: true, force: true }));
  const opaqueSecret = 'opaque-production-password-without-known-prefix';
  await writeFile(
    path.join(projectRoot, '.env.production'),
    [
      `SUPABASE_DB_PASSWORD=${opaqueSecret}`,
      `EXPO_PUBLIC_ACCIDENTAL_VALUE=${opaqueSecret}`,
      '',
    ].join('\n'),
  );

  const environment = readExpoBuildEnvironment(projectRoot, {});
  const problems = findUnsafePublicEnvironment(environment);

  assert.deepEqual(problems.map((problem) => problem.key), [
    'EXPO_PUBLIC_ACCIDENTAL_VALUE',
  ]);
});
