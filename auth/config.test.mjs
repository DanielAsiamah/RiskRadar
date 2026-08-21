import assert from 'node:assert/strict';
import test from 'node:test';
import { readPublicAuthConfig } from './config.mjs';

test('uses the current Supabase publishable key for frontend authentication', () => {
  const config = readPublicAuthConfig({
    EXPO_PUBLIC_SUPABASE_URL: 'https://riskradar.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_current',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'legacy-anon-key',
    EXPO_PUBLIC_WEB_APP_URL: 'https://riskradar.example',
  });

  assert.equal(config.configured, true);
  assert.equal(config.supabasePublishableKey, 'sb_publishable_current');
});

test('retains the legacy anon-key alias during migration', () => {
  const config = readPublicAuthConfig({
    EXPO_PUBLIC_SUPABASE_URL: 'https://riskradar.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
    EXPO_PUBLIC_WEB_APP_URL: 'http://localhost:8083',
  });

  assert.equal(config.configured, true);
  assert.equal(
    config.supabasePublishableKey,
    'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
  );
});

test('validates legacy anon keys without relying on a browser atob global', () => {
  const originalAtob = globalThis.atob;
  globalThis.atob = undefined;

  try {
    const config = readPublicAuthConfig({
      EXPO_PUBLIC_SUPABASE_URL: 'https://riskradar.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature',
      EXPO_PUBLIC_WEB_APP_URL: 'https://riskradar.example',
    });

    assert.equal(config.configured, true);
  } finally {
    globalThis.atob = originalAtob;
  }
});

test('refuses to initialise frontend auth with a Supabase secret key', () => {
  const config = readPublicAuthConfig({
    EXPO_PUBLIC_SUPABASE_URL: 'https://riskradar.supabase.co',
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never-public',
    EXPO_PUBLIC_WEB_APP_URL: 'https://riskradar.example',
  });

  assert.equal(config.configured, false);
  assert.equal(config.error, 'The frontend Supabase key must be publishable, never secret.');
});

test('refuses to expose a legacy service-role JWT in the frontend bundle', () => {
  const config = readPublicAuthConfig({
    EXPO_PUBLIC_SUPABASE_URL: 'https://riskradar.supabase.co',
    EXPO_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    EXPO_PUBLIC_WEB_APP_URL: 'https://riskradar.example',
  });

  assert.equal(config.configured, false);
  assert.equal(config.error, 'The frontend Supabase key must be publishable, never secret.');
});
