import assert from 'node:assert/strict';
import test from 'node:test';
import { createMembershipRouteHandler } from './routes.mjs';

function createRequest({ method, path, headers = {}, body = null }) {
  const chunks = body == null
    ? []
    : [Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))];

  return {
    method,
    headers,
    url: path,
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

function createWatchlistError(code, status, message) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function createDependencies(overrides = {}) {
  const premium = overrides.premium ?? true;
  return {
    config: {
      configured: true,
      webAppUrl: 'https://riskradar.app',
      ...overrides.config,
    },
    store: overrides.store || {
      async verifyAccessToken(token) {
        if (token !== 'valid-token') {
          throw new Error('Invalid token');
        }

        return {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'member@example.com',
        };
      },
      async getSubscription() {
        return premium ? {
          status: 'active',
          cancel_at_period_end: false,
          stripe_customer_id: 'cus_123',
        } : {
          status: 'free',
          cancel_at_period_end: false,
          stripe_customer_id: null,
        };
      },
    },
    billing: overrides.billing || {
      buildCheckoutUrl() {
        return 'https://buy.stripe.com/test_checkout';
      },
      async createPortalUrl() {
        return 'https://billing.stripe.com/session/portal_123';
      },
      async processWebhook() {
        return { accepted: true, duplicate: false };
      },
    },
    watchlistStore: overrides.watchlistStore || {
      async list() {
        return [{
          id: 'watch-1',
          label: 'Home',
          postcode: 'SE10 8EP',
          normalizedPostcode: 'SE10 8EP',
          lastCheckedMonth: '2026-05',
          lastSnapshot: { score: 6 },
          createdAt: '2026-08-12T10:00:00.000Z',
          updatedAt: '2026-08-12T10:05:00.000Z',
        }];
      },
      async create(_userId, input) {
        return {
          id: 'watch-2',
          label: input.label,
          postcode: input.postcode,
          normalizedPostcode: input.postcode,
          lastCheckedMonth: null,
          lastSnapshot: null,
          createdAt: '2026-08-12T10:00:00.000Z',
          updatedAt: '2026-08-12T10:00:00.000Z',
        };
      },
      async update(_userId, id, input) {
        return {
          id,
          label: input.label,
          postcode: 'SE10 8EP',
          normalizedPostcode: 'SE10 8EP',
          lastCheckedMonth: null,
          lastSnapshot: null,
          createdAt: '2026-08-12T10:00:00.000Z',
          updatedAt: '2026-08-12T10:05:00.000Z',
        };
      },
      async remove(_userId, id) {
        return { id };
      },
    },
  };
}

test('watchlist routes reject missing auth', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const response = createResponse();

  await routes.handle(
    createRequest({ method: 'GET', path: '/api/watchlist' }),
    response,
    new URL('http://localhost/api/watchlist'),
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'A valid member session is required.',
    code: 'AUTH_REQUIRED',
  });
});

test('watchlist routes reject free accounts with PREMIUM_REQUIRED', async () => {
  const routes = createMembershipRouteHandler(createDependencies({ premium: false }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/watchlist',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/watchlist'),
  );

  assert.equal(response.statusCode, 403);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'RiskRadar Premium is required for watched places.',
    code: 'PREMIUM_REQUIRED',
  });
});

test('GET /api/watchlist returns camelCase watched places for the owner', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/watchlist',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/watchlist'),
  );

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.ok(Array.isArray(payload.watchedPlaces));
  assert.equal(payload.watchedPlaces[0].normalizedPostcode, 'SE10 8EP');
  assert.equal('normalized_postcode' in payload.watchedPlaces[0], false);
});

test('POST /api/watchlist creates a watched place and returns camelCase fields', async () => {
  let captured = null;
  const routes = createMembershipRouteHandler(createDependencies({
    watchlistStore: {
      async list() {
        return [];
      },
      async create(userId, input) {
        captured = { userId, input };
        return {
          id: 'watch-2',
          label: input.label,
          postcode: input.postcode,
          normalizedPostcode: input.postcode,
          lastCheckedMonth: null,
          lastSnapshot: null,
          createdAt: '2026-08-12T10:00:00.000Z',
          updatedAt: '2026-08-12T10:00:00.000Z',
        };
      },
      async update() {
        throw new Error('unused');
      },
      async remove() {
        throw new Error('unused');
      },
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'POST',
      path: '/api/watchlist',
      headers: { authorization: 'Bearer valid-token' },
      body: { label: 'Home', postcode: 'SE10 8EP' },
    }),
    response,
    new URL('http://localhost/api/watchlist'),
  );

  assert.equal(response.statusCode, 201);
  assert.deepEqual(captured, {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    input: { label: 'Home', postcode: 'SE10 8EP' },
  });
  const payload = JSON.parse(response.body);
  assert.equal(payload.watchedPlace.normalizedPostcode, 'SE10 8EP');
  assert.equal('normalized_postcode' in payload.watchedPlace, false);
});

test('PATCH /api/watchlist/:id returns WATCH_NOT_FOUND for another user row', async () => {
  const routes = createMembershipRouteHandler(createDependencies({
    watchlistStore: {
      async list() {
        return [];
      },
      async create() {
        throw new Error('unused');
      },
      async update() {
        throw createWatchlistError('WATCH_NOT_FOUND', 404, 'Watched place not found.');
      },
      async remove() {
        throw new Error('unused');
      },
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'PATCH',
      path: '/api/watchlist/watch-999',
      headers: { authorization: 'Bearer valid-token' },
      body: { label: 'Home' },
    }),
    response,
    new URL('http://localhost/api/watchlist/watch-999'),
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'Watched place not found.',
    code: 'WATCH_NOT_FOUND',
  });
});

test('DELETE /api/watchlist/:id removes an owned watch', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'DELETE',
      path: '/api/watchlist/watch-1',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/watchlist/watch-1'),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    ok: true,
    deletedId: 'watch-1',
  });
});
