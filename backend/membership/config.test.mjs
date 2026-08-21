import assert from 'node:assert/strict';
import test from 'node:test';
import { readMembershipConfig, toPublicMembershipConfig } from './config.mjs';

test('marks membership as unconfigured when required values are missing', () => {
  assert.equal(readMembershipConfig({}).configured, false);
});

test('marks membership as configured when all required values are present', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    STRIPE_SECRET_KEY: 'sk_test_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_value',
    STRIPE_PREMIUM_PRICE_ID: 'price_123',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/test',
    BILLING_REFERENCE_SECRET: '0123456789abcdef0123456789abcdef',
    WEB_APP_URL: 'http://localhost:8081',
  });

  assert.equal(config.configured, true);
  assert.equal(config.supabaseAdminKey.endsWith('.signature'), true);
});

test('prefers the current Supabase secret key while retaining the legacy alias', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_current',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role',
    STRIPE_SECRET_KEY: 'sk_test_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_value',
    STRIPE_PREMIUM_PRICE_ID: 'price_123',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/test',
    BILLING_REFERENCE_SECRET: '0123456789abcdef0123456789abcdef',
    WEB_APP_URL: 'http://localhost:8081',
  });

  assert.equal(config.configured, true);
  assert.equal(config.supabaseAdminKey, 'sb_secret_current');
});

test('public membership config exposes only safe fields', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
    STRIPE_SECRET_KEY: 'sk_test_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_value',
    STRIPE_PREMIUM_PRICE_ID: 'price_123',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/cNi28r77pbVJdNU2HkcAo03',
    BILLING_REFERENCE_SECRET: '0123456789abcdef0123456789abcdef',
    WEB_APP_URL: 'https://riskradar.example',
  });

  assert.deepEqual(toPublicMembershipConfig(config), {
    configured: true,
    paymentLinkHost: 'buy.stripe.com',
  });
});

test('does not enable membership with public Supabase or malformed Stripe credentials', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_publishable_wrong-side',
    STRIPE_SECRET_KEY: 'pk_test_wrong-side',
    STRIPE_WEBHOOK_SECRET: 'not-a-signing-secret',
    STRIPE_PREMIUM_PRICE_ID: 'product_wrong-side',
    STRIPE_PAYMENT_LINK_URL: 'https://example.com/checkout',
    BILLING_REFERENCE_SECRET: 'too-short',
    WEB_APP_URL: 'https://riskradar.example',
  });

  assert.equal(config.configured, false);
});

test('does not enable membership with untouched environment-template placeholders', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://your-project.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_replace-me',
    STRIPE_SECRET_KEY: 'sk_test_replace-me',
    STRIPE_WEBHOOK_SECRET: 'whsec_replace-me',
    STRIPE_PREMIUM_PRICE_ID: 'price_replace-me',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/replace-me',
    BILLING_REFERENCE_SECRET: 'replace-me-with-at-least-32-random-characters',
    WEB_APP_URL: 'https://your-frontend-domain.example',
  });

  assert.equal(config.configured, false);
});
