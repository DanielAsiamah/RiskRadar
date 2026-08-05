import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStripeSubscription, shouldApplyStripeEvent, toEntitlement } from './subscription-state.mjs';

test('active subscriptions map to premium entitlement', () => {
  assert.deepEqual(
    toEntitlement({
      email: 'member@example.com',
      status: 'active',
      current_period_end: '2026-08-31T00:00:00.000Z',
      cancel_at_period_end: false,
      stripe_customer_id: 'cus_123',
    }, true),
    {
      configured: true,
      authenticated: true,
      email: 'member@example.com',
      status: 'active',
      premium: true,
      currentPeriodEnd: '2026-08-31T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      canManageBilling: true,
    },
  );
});

test('trialing subscriptions remain premium', () => {
  assert.equal(
    toEntitlement({
      email: 'member@example.com',
      status: 'trialing',
      current_period_end: null,
      cancel_at_period_end: false,
      stripe_customer_id: 'cus_123',
    }, true).premium,
    true,
  );
});

test('cancel at period end becomes canceling but keeps premium access', () => {
  const entitlement = toEntitlement({
    email: 'member@example.com',
    status: 'active',
    current_period_end: '2026-08-31T00:00:00.000Z',
    cancel_at_period_end: true,
    stripe_customer_id: 'cus_123',
  }, true);

  assert.equal(entitlement.status, 'canceling');
  assert.equal(entitlement.premium, true);
});

test('past due, unpaid, incomplete expired, canceled, and missing rows are not premium', () => {
  for (const status of ['past_due', 'unpaid', 'incomplete_expired', 'canceled']) {
    assert.equal(
      toEntitlement({
        email: 'member@example.com',
        status,
        current_period_end: null,
        cancel_at_period_end: false,
        stripe_customer_id: 'cus_123',
      }, true).premium,
      false,
    );
  }

  assert.deepEqual(toEntitlement(null, true), {
    configured: true,
    authenticated: false,
    email: null,
    status: 'free',
    premium: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canManageBilling: false,
  });
});

test('unconfigured services return unavailable entitlement', () => {
  assert.deepEqual(toEntitlement(null, false), {
    configured: false,
    authenticated: false,
    email: null,
    status: 'unavailable',
    premium: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canManageBilling: false,
  });
});

test('older stripe events cannot replace newer state', () => {
  assert.equal(
    shouldApplyStripeEvent('2026-08-05T12:00:00.000Z', '2026-08-05T11:59:59.000Z'),
    false,
  );
  assert.equal(
    shouldApplyStripeEvent('2026-08-05T12:00:00.000Z', '2026-08-05T12:00:01.000Z'),
    true,
  );
});

test('normalizes stripe subscriptions to database rows', () => {
  assert.deepEqual(
    normalizeStripeSubscription(
      {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        cancel_at_period_end: false,
        current_period_end: 1788134400,
        items: {
          data: [
            {
              price: { id: 'price_123' },
            },
          ],
        },
      },
      '123e4567-e89b-12d3-a456-426614174000',
      '2026-08-05T12:00:00.000Z',
    ),
    {
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      stripe_price_id: 'price_123',
      status: 'active',
      current_period_end: '2026-08-31T00:00:00.000Z',
      cancel_at_period_end: false,
      last_event_created_at: '2026-08-05T12:00:00.000Z',
    },
  );
});
