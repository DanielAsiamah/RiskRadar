import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findWebBundleSecretLeaks } from './verify-web-bundle-secrets.mjs';

test('accepts a web bundle containing only browser-safe configuration', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riskradar-safe-bundle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(path.join(directory, 'index.js'), 'const key="sb_publishable_browser-safe";');

  assert.deepEqual(await findWebBundleSecretLeaks(directory, {}), []);
});

test('reports backend secrets without returning their values', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riskradar-secret-bundle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secret = ['sb', 'secret', 'abcdefghijklmnopqrstuvwxyz'].join('_');
  await writeFile(path.join(directory, 'index.js'), `const leaked="${secret}";`);

  const leaks = await findWebBundleSecretLeaks(directory, {
    SUPABASE_SECRET_KEY: secret,
  });

  assert.deepEqual(leaks, [{
    file: 'index.js',
    source: 'SUPABASE_SECRET_KEY',
  }]);
  assert.equal(JSON.stringify(leaks).includes(secret), false);
});

test('detects secret-shaped values even when the backend environment is unavailable', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'riskradar-shaped-bundle-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const secret = ['whsec', 'abcdefghijklmnopqrstuvwxyz'].join('_');
  await writeFile(path.join(directory, 'index.js'), `const leaked="${secret}";`);

  assert.deepEqual(await findWebBundleSecretLeaks(directory, {}), [{
    file: 'index.js',
    source: 'secret-shaped value',
  }]);
});
