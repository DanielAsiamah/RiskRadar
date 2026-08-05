import assert from 'node:assert/strict';
import test from 'node:test';
import { readMembershipConfig, toPublicMembershipConfig } from './config.mjs';

test('marks membership as unconfigured when required values are missing', () => {
  assert.equal(readMembershipConfig({}).configured, false);
});

test('marks membership as configured when all required values are present', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    STRIPE_SECRET_KEY: 'sk_test_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_value',
    STRIPE_PREMIUM_PRICE_ID: 'price_123',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/test',
    BILLING_REFERENCE_SECRET: 'a-long-random-secret',
    WEB_APP_URL: 'http://localhost:8081',
  });

  assert.equal(config.configured, true);
});

test('public membership config exposes only safe fields', () => {
  const config = readMembershipConfig({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    STRIPE_SECRET_KEY: 'sk_test_value',
    STRIPE_WEBHOOK_SECRET: 'whsec_value',
    STRIPE_PREMIUM_PRICE_ID: 'price_123',
    STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/cNi28r77pbVJdNU2HkcAo03',
    BILLING_REFERENCE_SECRET: 'a-long-random-secret',
    WEB_APP_URL: 'https://riskradar.example',
  });

  assert.deepEqual(toPublicMembershipConfig(config), {
    configured: true,
    paymentLinkHost: 'buy.stripe.com',
  });
});
