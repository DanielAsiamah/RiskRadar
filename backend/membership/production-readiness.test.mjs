import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkMembershipReadiness } from './production-readiness.mjs';

function completeEnvironment(overrides = {}) {
  return {
    NODE_ENV: 'production',
    SUPABASE_URL: 'https://riskradar.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_backend-key',
    EXPO_PUBLIC_SUPABASE_URL: 'https://riskradar.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_frontend-key',
    STRIPE_SECRET_KEY: 'sk_test_backend-key',
    STRIPE_WEBHOOK_SECRET: 'whsec_webhook-key',
    STRIPE_PREMIUM_PRICE_ID: 'price_riskradar-premium',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/test_riskradar',
    BILLING_REFERENCE_SECRET: '0123456789abcdef0123456789abcdef',
    WEB_APP_URL: 'https://riskradar.app',
    EXPO_PUBLIC_WEB_APP_URL: 'https://riskradar.app',
    ...overrides,
  };
}

test('reports every missing frontend and backend membership setting', () => {
  const result = checkMembershipReadiness({ NODE_ENV: 'production' });
  const keys = result.errors.map((error) => error.key);

  assert.equal(result.ready, false);
  assert.deepEqual(keys, [
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PREMIUM_PRICE_ID',
    'STRIPE_PAYMENT_LINK_URL',
    'BILLING_REFERENCE_SECRET',
    'WEB_APP_URL',
    'EXPO_PUBLIC_WEB_APP_URL',
  ]);
});

test('rejects placeholders, unsafe production URLs, short signing secrets, and wrong key types', () => {
  const result = checkMembershipReadiness(completeEnvironment({
    SUPABASE_URL: 'http://your-project.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_publishable_wrong-side',
    EXPO_PUBLIC_SUPABASE_URL: 'http://your-project.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_wrong-side',
    STRIPE_SECRET_KEY: 'pk_test_wrong-side',
    STRIPE_WEBHOOK_SECRET: 'webhook-secret',
    STRIPE_PREMIUM_PRICE_ID: 'product_not-a-price',
    STRIPE_PAYMENT_LINK_URL: 'http://example.com/pay',
    BILLING_REFERENCE_SECRET: 'too-short',
    WEB_APP_URL: 'http://localhost:8083',
    EXPO_PUBLIC_WEB_APP_URL: 'http://localhost:8083',
  }));
  const keys = new Set(result.errors.map((error) => error.key));

  assert.equal(result.ready, false);
  for (const key of [
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'EXPO_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PREMIUM_PRICE_ID',
    'STRIPE_PAYMENT_LINK_URL',
    'BILLING_REFERENCE_SECRET',
    'WEB_APP_URL',
    'EXPO_PUBLIC_WEB_APP_URL',
  ]) {
    assert.equal(keys.has(key), true, `${key} should be rejected`);
  }
});

test('accepts a complete current-key test-mode configuration', () => {
  assert.deepEqual(checkMembershipReadiness(completeEnvironment()), {
    ready: true,
    errors: [],
  });
});

test('accepts legacy Supabase key aliases during migration', () => {
  const env = completeEnvironment({
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
  });

  assert.equal(checkMembershipReadiness(env).ready, true);
});

test('rejects legacy Supabase JWTs used on the wrong side of the application', () => {
  const result = checkMembershipReadiness(completeEnvironment({
    SUPABASE_SECRET_KEY: '',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: '',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
  }));
  const keys = result.errors.map((error) => error.key);

  assert.equal(result.ready, false);
  assert.equal(keys.includes('SUPABASE_SECRET_KEY'), true);
  assert.equal(keys.includes('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), true);
});

test('CLI diagnostics never echo configured secret values', () => {
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'production-readiness.mjs');
  const leakedValue = 'LEAK_THIS_SECRET_VALUE';
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: completeEnvironment({
      BILLING_REFERENCE_SECRET: leakedValue,
    }),
  });
  const output = `${result.stdout}\n${result.stderr}`;

  assert.equal(result.status, 1);
  assert.equal(output.includes('BILLING_REFERENCE_SECRET'), true);
  assert.equal(output.includes(leakedValue), false);
});
