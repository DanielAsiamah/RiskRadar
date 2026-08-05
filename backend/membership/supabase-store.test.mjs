import assert from 'node:assert/strict';
import test from 'node:test';
import { createSupabaseMembershipStore } from './supabase-store.mjs';

function createResponse(status, jsonBody) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return jsonBody;
    },
    async text() {
      return JSON.stringify(jsonBody);
    },
  };
}

function createStore(fetchImpl) {
  return createSupabaseMembershipStore({
    supabaseUrl: 'https://riskradar.supabase.co',
    supabaseServiceRoleKey: 'service-role',
  }, fetchImpl);
}

test('verifyAccessToken calls the Supabase auth user endpoint with bearer auth', async () => {
  const calls = [];
  const store = createStore(async (input, init) => {
    calls.push({ input, init });
    return createResponse(200, { id: 'user-1', email: 'member@example.com' });
  });

  const user = await store.verifyAccessToken('token-123');

  assert.equal(user.email, 'member@example.com');
  assert.equal(calls[0].input, 'https://riskradar.supabase.co/auth/v1/user');
  assert.equal(calls[0].init.headers.apikey, 'service-role');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token-123');
});

test('subscription lookups use exact filters', async () => {
  const calls = [];
  const store = createStore(async (input) => {
    calls.push(input);
    return createResponse(200, [{ user_id: 'user-1' }]);
  });

  await store.getSubscription('123e4567-e89b-12d3-a456-426614174000');
  await store.getSubscriptionByStripeCustomer('cus_123');
  await store.getSubscriptionByStripeSubscription('sub_123');

  assert.match(calls[0], /user_id=eq\.123e4567-e89b-12d3-a456-426614174000/);
  assert.match(calls[1], /stripe_customer_id=eq\.cus_123/);
  assert.match(calls[2], /stripe_subscription_id=eq\.sub_123/);
});

test('upsertSubscription uses merge duplicates semantics', async () => {
  const calls = [];
  const store = createStore(async (input, init) => {
    calls.push({ input, init });
    return createResponse(201, []);
  });

  await store.upsertSubscription({
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    status: 'active',
  });

  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer service-role');
  assert.equal(calls[0].init.headers.Prefer, 'resolution=merge-duplicates');
});

test('claimBillingEvent inserts once and reports duplicates safely', async () => {
  const responses = [
    createResponse(201, [{ stripe_event_id: 'evt_1' }]),
    createResponse(409, { code: '23505' }),
  ];
  const store = createStore(async () => responses.shift());

  assert.equal(await store.claimBillingEvent({ stripe_event_id: 'evt_1', event_type: 'invoice.paid' }), true);
  assert.equal(await store.claimBillingEvent({ stripe_event_id: 'evt_1', event_type: 'invoice.paid' }), false);
});
