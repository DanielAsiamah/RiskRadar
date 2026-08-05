import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyCheckoutReference } from './checkout-reference.mjs';
import { createStripeBilling } from './stripe-billing.mjs';

const baseConfig = {
  configured: true,
  stripeWebhookSecret: 'whsec_test_secret',
  stripePremiumPriceId: 'price_premium',
  stripePaymentLinkUrl: 'https://buy.stripe.com/cNi28r77pbVJdNU2HkcAo03?prefilled_promo_code=launch',
  billingReferenceSecret: '0123456789abcdef0123456789abcdef',
  webAppUrl: 'https://riskradar.app',
};

function createStore(overrides = {}) {
  const state = {
    claimed: [],
    upserts: [],
    byCustomer: new Map(),
    bySubscription: new Map(),
    byUserId: new Map(),
    ...overrides,
  };

  return {
    state,
    async claimBillingEvent(event) {
      state.claimed.push(event);
      if (overrides.claimBillingEventResult === false) {
        return false;
      }
      return true;
    },
    async upsertSubscription(row) {
      state.upserts.push(row);
      if (row.stripe_customer_id) {
        state.byCustomer.set(row.stripe_customer_id, row);
      }
      if (row.stripe_subscription_id) {
        state.bySubscription.set(row.stripe_subscription_id, row);
      }
      state.byUserId.set(row.user_id, row);
    },
    async getSubscriptionByStripeCustomer(customerId) {
      return state.byCustomer.get(customerId) ?? null;
    },
    async getSubscriptionByStripeSubscription(subscriptionId) {
      return state.bySubscription.get(subscriptionId) ?? null;
    },
    async getSubscription(userId) {
      return state.byUserId.get(userId) ?? null;
    },
  };
}

function createStripe(overrides = {}) {
  const calls = {
    constructEvent: [],
    listLineItems: [],
    retrieveSubscription: [],
    createPortalSession: [],
  };

  const stripe = {
    calls,
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        calls.constructEvent.push({ rawBody, signature, secret });
        if (overrides.constructEventError) {
          throw overrides.constructEventError;
        }
        return overrides.event;
      },
    },
    checkout: {
      sessions: {
        async listLineItems(sessionId) {
          calls.listLineItems.push(sessionId);
          return overrides.lineItems ?? { data: [] };
        },
      },
    },
    subscriptions: {
      async retrieve(subscriptionId) {
        calls.retrieveSubscription.push(subscriptionId);
        return overrides.subscription ?? null;
      },
    },
    billingPortal: {
      sessions: {
        async create(payload) {
          calls.createPortalSession.push(payload);
          return overrides.portalSession ?? { url: 'https://billing.stripe.com/session/test' };
        },
      },
    },
  };

  return stripe;
}

test('buildCheckoutUrl signs a 15-minute client reference and preserves link params', () => {
  const store = createStore();
  const stripe = createStripe();
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  const checkoutUrl = billing.buildCheckoutUrl({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    email: 'member@example.com',
  });
  const url = new URL(checkoutUrl);

  assert.equal(url.origin, 'https://buy.stripe.com');
  assert.equal(url.searchParams.get('prefilled_email'), 'member@example.com');
  assert.equal(url.searchParams.get('prefilled_promo_code'), 'launch');
  assert.ok(url.searchParams.get('client_reference_id'));
  assert.ok(!checkoutUrl.includes(baseConfig.billingReferenceSecret));
  assert.ok(!checkoutUrl.includes('service-role'));

  const verified = verifyCheckoutReference(
    url.searchParams.get('client_reference_id'),
    baseConfig.billingReferenceSecret,
  );
  const expiresAt = new Date(verified.expiresAt).getTime();
  const now = Date.now();

  assert.ok(expiresAt - now <= 15 * 60 * 1000);
  assert.ok(expiresAt - now > 0);
});

test('processWebhook rejects invalid signatures before any Stripe reads', async () => {
  const store = createStore();
  const stripe = createStripe({
    constructEventError: new Error('Invalid signature'),
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  await assert.rejects(
    () => billing.processWebhook(Buffer.from('raw'), 'bad-signature'),
    /invalid signature/i,
  );
  assert.equal(stripe.calls.listLineItems.length, 0);
  assert.equal(stripe.calls.retrieveSubscription.length, 0);
});

test('checkout.session.completed verifies the signed reference and stores premium subscription', async () => {
  const store = createStore();
  const signedReference = createStripeBilling({ config: baseConfig, store, stripe: createStripe() }).buildCheckoutUrl({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    email: 'member@example.com',
  });
  const reference = new URL(signedReference).searchParams.get('client_reference_id');
  const stripe = createStripe({
    event: {
      id: 'evt_checkout_1',
      type: 'checkout.session.completed',
      created: 1785931200,
      data: {
        object: {
          id: 'cs_test_123',
          client_reference_id: reference,
          customer: 'cus_123',
          subscription: 'sub_123',
        },
      },
    },
    lineItems: {
      data: [
        {
          price: { id: 'price_premium' },
        },
      ],
    },
    subscription: {
      id: 'sub_123',
      customer: 'cus_123',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1788613200,
      items: {
        data: [
          { price: { id: 'price_premium' } },
        ],
      },
    },
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  const result = await billing.processWebhook(Buffer.from('raw'), 'sig_ok');

  assert.deepEqual(result, { accepted: true, duplicate: false });
  assert.equal(store.state.upserts.length, 1);
  assert.equal(store.state.upserts[0].user_id, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(store.state.upserts[0].stripe_customer_id, 'cus_123');
  assert.equal(store.state.upserts[0].stripe_subscription_id, 'sub_123');
});

test('checkout.session.completed requires the premium price in purchased line items', async () => {
  const store = createStore();
  const signedReference = createStripeBilling({ config: baseConfig, store, stripe: createStripe() }).buildCheckoutUrl({
    userId: '123e4567-e89b-12d3-a456-426614174000',
    email: 'member@example.com',
  });
  const reference = new URL(signedReference).searchParams.get('client_reference_id');
  const stripe = createStripe({
    event: {
      id: 'evt_checkout_2',
      type: 'checkout.session.completed',
      created: 1785931200,
      data: {
        object: {
          id: 'cs_test_456',
          client_reference_id: reference,
          customer: 'cus_456',
          subscription: 'sub_456',
        },
      },
    },
    lineItems: {
      data: [
        {
          price: { id: 'price_other' },
        },
      ],
    },
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  await assert.rejects(() => billing.processWebhook(Buffer.from('raw'), 'sig_ok'), /premium price/i);
});

test('subscription and invoice events resolve users from stored Stripe ids only', async () => {
  const store = createStore();
  await store.upsertSubscription({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    stripe_customer_id: 'cus_known',
    stripe_subscription_id: 'sub_known',
    stripe_price_id: 'price_premium',
    status: 'active',
    current_period_end: '2026-08-10T00:00:00.000Z',
    cancel_at_period_end: false,
    last_event_created_at: '2026-08-01T00:00:00.000Z',
  });
  const stripe = createStripe({
    event: {
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      created: 1786017600,
      data: {
        object: {
          id: 'in_123',
          customer: 'cus_known',
          subscription: 'sub_known',
        },
      },
    },
    subscription: {
      id: 'sub_known',
      customer: 'cus_known',
      status: 'active',
      cancel_at_period_end: false,
      current_period_end: 1788613200,
      items: {
        data: [
          { price: { id: 'price_premium' } },
        ],
      },
    },
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  await billing.processWebhook(Buffer.from('raw'), 'sig_ok');

  assert.equal(store.state.upserts.at(-1).user_id, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(store.state.upserts.at(-1).status, 'active');
});

test('duplicate webhook events are ignored after the claim check', async () => {
  const store = createStore({ claimBillingEventResult: false });
  const stripe = createStripe({
    event: {
      id: 'evt_duplicate',
      type: 'invoice.paid',
      created: 1786017600,
      data: { object: {} },
    },
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  const result = await billing.processWebhook(Buffer.from('raw'), 'sig_ok');

  assert.deepEqual(result, { accepted: true, duplicate: true });
  assert.equal(store.state.upserts.length, 0);
});

test('invoice.payment_failed records past_due and customer.subscription.deleted revokes access', async () => {
  const store = createStore();
  await store.upsertSubscription({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    stripe_customer_id: 'cus_known',
    stripe_subscription_id: 'sub_known',
    stripe_price_id: 'price_premium',
    status: 'active',
    current_period_end: '2026-08-10T00:00:00.000Z',
    cancel_at_period_end: false,
    last_event_created_at: '2026-08-01T00:00:00.000Z',
  });

  const failedStripe = createStripe({
    event: {
      id: 'evt_invoice_failed',
      type: 'invoice.payment_failed',
      created: 1786104000,
      data: {
        object: {
          id: 'in_456',
          customer: 'cus_known',
          subscription: 'sub_known',
        },
      },
    },
    subscription: {
      id: 'sub_known',
      customer: 'cus_known',
      status: 'past_due',
      cancel_at_period_end: false,
      current_period_end: 1788613200,
      items: { data: [{ price: { id: 'price_premium' } }] },
    },
  });
  const billingFailed = createStripeBilling({ config: baseConfig, store, stripe: failedStripe });
  await billingFailed.processWebhook(Buffer.from('raw'), 'sig_ok');

  assert.equal(store.state.upserts.at(-1).status, 'past_due');

  const deletedStripe = createStripe({
    event: {
      id: 'evt_subscription_deleted',
      type: 'customer.subscription.deleted',
      created: 1786190400,
      data: {
        object: {
          id: 'sub_known',
          customer: 'cus_known',
          status: 'canceled',
          cancel_at_period_end: false,
          current_period_end: 1788613200,
          items: { data: [{ price: { id: 'price_premium' } }] },
        },
      },
    },
  });
  const billingDeleted = createStripeBilling({ config: baseConfig, store, stripe: deletedStripe });
  await billingDeleted.processWebhook(Buffer.from('raw'), 'sig_ok');

  assert.equal(store.state.upserts.at(-1).status, 'canceled');
});

test('older events do not regress a newer stored state', async () => {
  const store = createStore();
  await store.upsertSubscription({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    stripe_customer_id: 'cus_known',
    stripe_subscription_id: 'sub_known',
    stripe_price_id: 'price_premium',
    status: 'active',
    current_period_end: '2026-08-10T00:00:00.000Z',
    cancel_at_period_end: false,
    last_event_created_at: '2026-08-05T12:00:00.000Z',
  });
  const stripe = createStripe({
    event: {
      id: 'evt_old',
      type: 'invoice.payment_failed',
      created: 1785927600,
      data: {
        object: {
          customer: 'cus_known',
          subscription: 'sub_known',
        },
      },
    },
    subscription: {
      id: 'sub_known',
      customer: 'cus_known',
      status: 'past_due',
      cancel_at_period_end: false,
      current_period_end: 1788613200,
      items: { data: [{ price: { id: 'price_premium' } }] },
    },
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  await billing.processWebhook(Buffer.from('raw'), 'sig_ok');

  assert.equal(store.state.upserts.length, 1);
  assert.equal(store.state.upserts[0].status, 'active');
});

test('createPortalUrl requires a stored Stripe customer and a matching app url', async () => {
  const store = createStore();
  await store.upsertSubscription({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    stripe_customer_id: 'cus_portal',
    stripe_subscription_id: 'sub_portal',
    stripe_price_id: 'price_premium',
    status: 'active',
    current_period_end: '2026-08-10T00:00:00.000Z',
    cancel_at_period_end: false,
    last_event_created_at: '2026-08-01T00:00:00.000Z',
  });
  const stripe = createStripe({
    portalSession: { url: 'https://billing.stripe.com/session/portal_123' },
  });
  const billing = createStripeBilling({ config: baseConfig, store, stripe });

  const portalUrl = await billing.createPortalUrl(
    { userId: '123e4567-e89b-12d3-a456-426614174000' },
    'https://riskradar.app/account',
  );

  assert.equal(portalUrl, 'https://billing.stripe.com/session/portal_123');
  assert.deepEqual(stripe.calls.createPortalSession[0], {
    customer: 'cus_portal',
    return_url: 'https://riskradar.app/account',
  });

  await assert.rejects(
    () => billing.createPortalUrl({ userId: 'missing-user' }, 'https://riskradar.app/account'),
    /stripe customer/i,
  );
  await assert.rejects(
    () => billing.createPortalUrl(
      { userId: '123e4567-e89b-12d3-a456-426614174000' },
      'https://evil.example/account',
    ),
    /return url/i,
  );
});
