import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteGuardAccess } from './route-guard-access.mjs';

const now = Date.parse('2026-10-06T12:00:00Z');
const localEnv = { NODE_ENV: 'development', ROUTE_GUARD_LOCAL_DEVELOPMENT: 'true' };
const request = (headers = {}, address = '127.0.0.1') => ({
  headers: { host: 'localhost:3001', ...headers },
  socket: { remoteAddress: address },
});
const localAccess = (options = {}) => createRouteGuardAccess({
  env: localEnv, host: '127.0.0.1', port: 3001, ...options,
});
const paidAccess = (subscription = {}, storeOverrides = {}) => createRouteGuardAccess({
  env: {}, config: { configured: true }, now: () => now,
  store: {
    verifyAccessToken: async (token) => token === 'valid-token' ? { id: 'user-1' } : null,
    getSubscription: async () => ({
      user_id: 'user-1', status: 'active', current_period_end: '2026-11-01T00:00:00Z', ...subscription,
    }),
    ...storeOverrides,
  },
});

test('explicit local mode admits same-origin loopback traffic without a membership store', async () => {
  const access = localAccess();
  assert.equal(access.describe(request()).localDevelopment, true);
  assert.deepEqual(await access.authorize(request({ origin: 'http://localhost:3001' })), {
    mode: 'local-development',
  });
  assert.equal((await access.authorize(request({}, '::ffff:127.0.0.1'))).mode, 'local-development');
});

test('local access is disabled by default and in production or a public bind', async () => {
  for (const options of [
    { env: {} },
    { env: { ...localEnv, NODE_ENV: 'production' } },
    { host: '0.0.0.0' },
    { host: '::' },
  ]) {
    const access = localAccess(options);
    assert.equal(access.describe(request()).localDevelopment, false);
    await assert.rejects(access.authorize(request()), { code: 'ROUTE_GUARD_AUTH_UNAVAILABLE' });
  }
});

test('local mode rejects remote peers, foreign origins, rebinding hosts and forwarded requests', async () => {
  for (const req of [
    request({}, '192.168.1.20'),
    request({ host: 'attacker.example:3001' }),
    request({ host: 'localhost:9999' }),
    request({ origin: 'https://attacker.example' }),
    request({ origin: 'http://localhost:3002' }),
    request({ origin: 'http://127.0.0.1:3001' }),
    request({ origin: 'null' }),
    request({ 'sec-fetch-site': 'cross-site' }),
    request({ 'x-forwarded-for': '127.0.0.1' }),
    request({ 'x-forwarded-host': 'localhost:3001' }),
    request({ forwarded: 'for=127.0.0.1' }),
  ]) {
    const access = localAccess();
    assert.equal(access.describe(req).localDevelopment, false);
    await assert.rejects(access.authorize(req), { code: 'ROUTE_GUARD_AUTH_UNAVAILABLE' });
  }
});

test('a configured deployment verifies a bearer token and active subscription', async () => {
  const access = paidAccess();
  assert.deepEqual(await access.authorize(request({ authorization: 'Bearer valid-token' })), {
    mode: 'subscription', userId: 'user-1',
  });
  await assert.rejects(access.authorize(request()), { statusCode: 401 });
  await assert.rejects(access.authorize(request({ authorization: 'Bearer forged-token' })), { statusCode: 401 });
});

test('expired, missing, delinquent or mismatched subscriptions cannot scan routes', async () => {
  for (const subscription of [
    { status: 'free' }, { status: 'past_due' }, { status: 'canceled' },
    { current_period_end: null }, { current_period_end: 'invalid' },
    { current_period_end: '2026-10-06T12:00:00Z' },
    { user_id: 'different-user' },
  ]) {
    await assert.rejects(paidAccess(subscription).authorize(request({ authorization: 'Bearer valid-token' })), {
      statusCode: 403, code: 'PREMIUM_REQUIRED',
    });
  }
  await assert.rejects(paidAccess({}, { getSubscription: async () => null }).authorize(request({ authorization: 'Bearer valid-token' })), {
    code: 'PREMIUM_REQUIRED',
  });
});

test('trial and cancel-at-period-end subscriptions work only during their paid period', async () => {
  for (const status of ['trialing', 'canceling']) {
    const access = paidAccess({ status, cancel_at_period_end: true });
    assert.equal((await access.authorize(request({ authorization: 'Bearer valid-token' }))).mode, 'subscription');
  }
});

test('membership failures are fail-closed and do not expose upstream details', async () => {
  const access = paidAccess({}, { getSubscription: async () => { throw new Error('private upstream information'); } });
  await assert.rejects(access.authorize(request({ authorization: 'Bearer valid-token' })), (error) => {
    assert.equal(error.statusCode, 503);
    assert.equal(error.code, 'ROUTE_GUARD_AUTH_UNAVAILABLE');
    assert.doesNotMatch(error.message, /private upstream/);
    return true;
  });
});

test('membership verification has a finite response deadline', async () => {
  const access = createRouteGuardAccess({
    config: { configured: true }, timeoutMs: 10,
    store: { verifyAccessToken: () => new Promise(() => {}) },
  });
  await assert.rejects(access.authorize(request({ authorization: 'Bearer valid-token' })), {
    statusCode: 503, code: 'ROUTE_GUARD_AUTH_UNAVAILABLE',
  });
});
