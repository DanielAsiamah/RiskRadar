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

function createDependencies(overrides = {}) {
  const premium = overrides.premium ?? true;
  const store = overrides.store || {
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
      } : null;
    },
    async getAlertPreferences() {
      return {
        monthlyEmailEnabled: true,
        categoryChangeEnabled: true,
        volumeChangeEnabled: true,
        updatedAt: '2026-08-12T12:00:00.000Z',
      };
    },
    async upsertAlertPreferences(_userId, input) {
      return {
        ...input,
        updatedAt: '2026-08-12T12:00:00.000Z',
      };
    },
  };

  const billing = overrides.billing || {
    buildCheckoutUrl() {
      return 'https://buy.stripe.com/test_checkout';
    },
    async createPortalUrl() {
      return 'https://billing.stripe.com/session/portal_123';
    },
    async processWebhook() {
      return {
        accepted: true,
        duplicate: false,
      };
    },
  };

  return {
    config: {
      configured: true,
      webAppUrl: 'https://riskradar.app',
      ...overrides.config,
    },
    store,
    billing,
  };
}

test('alert preferences route enforces auth and premium access', async () => {
  const noAuthRoutes = createMembershipRouteHandler(createDependencies());
  const noAuthResponse = createResponse();

  await noAuthRoutes.handle(
    createRequest({ method: 'GET', path: '/api/alert-preferences' }),
    noAuthResponse,
    new URL('http://localhost/api/alert-preferences'),
  );

  assert.equal(noAuthResponse.statusCode, 401);
  assert.deepEqual(JSON.parse(noAuthResponse.body), {
    error: 'A valid member session is required.',
    code: 'AUTH_REQUIRED',
  });

  const freeRoutes = createMembershipRouteHandler(createDependencies({ premium: false }));
  const freeResponse = createResponse();

  await freeRoutes.handle(
    createRequest({
      method: 'GET',
      path: '/api/alert-preferences',
      headers: { authorization: 'Bearer valid-token' },
    }),
    freeResponse,
    new URL('http://localhost/api/alert-preferences'),
  );

  assert.equal(freeResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(freeResponse.body), {
    error: 'RiskRadar Premium is required for watched places.',
    code: 'PREMIUM_REQUIRED',
  });
});

test('GET /api/alert-preferences creates and returns default preferences when none exist', async () => {
  const calls = [];
  const routes = createMembershipRouteHandler(createDependencies({
    store: {
      async verifyAccessToken() {
        return {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'member@example.com',
        };
      },
      async getSubscription() {
        return {
          status: 'active',
          cancel_at_period_end: false,
          stripe_customer_id: 'cus_123',
        };
      },
      async getAlertPreferences(userId) {
        calls.push({ type: 'get', userId });
        return null;
      },
      async upsertAlertPreferences(userId, input) {
        calls.push({ type: 'upsert', userId, input });
        return {
          ...input,
          updatedAt: '2026-08-12T12:00:00.000Z',
        };
      },
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/alert-preferences',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/alert-preferences'),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [
    { type: 'get', userId: '123e4567-e89b-12d3-a456-426614174000' },
    {
      type: 'upsert',
      userId: '123e4567-e89b-12d3-a456-426614174000',
      input: {
        monthlyEmailEnabled: true,
        categoryChangeEnabled: true,
        volumeChangeEnabled: true,
      },
    },
  ]);
  assert.deepEqual(JSON.parse(response.body), {
    email: 'member@example.com',
    monthlyEmailEnabled: true,
    categoryChangeEnabled: true,
    volumeChangeEnabled: true,
    updatedAt: '2026-08-12T12:00:00.000Z',
  });
});

test('PUT /api/alert-preferences accepts only boolean values', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'PUT',
      path: '/api/alert-preferences',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        monthlyEmailEnabled: 'yes',
        categoryChangeEnabled: true,
        volumeChangeEnabled: true,
      },
    }),
    response,
    new URL('http://localhost/api/alert-preferences'),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'Alert preferences must include Boolean values for monthlyEmailEnabled, categoryChangeEnabled, and volumeChangeEnabled.',
    code: 'INVALID_ALERT_PREFERENCES',
  });
});

test('PUT /api/alert-preferences uses the authenticated owner and returns camelCase fields', async () => {
  const calls = [];
  const routes = createMembershipRouteHandler(createDependencies({
    store: {
      async verifyAccessToken() {
        return {
          id: '123e4567-e89b-12d3-a456-426614174000',
          email: 'member@example.com',
        };
      },
      async getSubscription() {
        return {
          status: 'active',
          cancel_at_period_end: false,
          stripe_customer_id: 'cus_123',
        };
      },
      async getAlertPreferences() {
        throw new Error('unused');
      },
      async upsertAlertPreferences(userId, input) {
        calls.push({ userId, input });
        return {
          monthlyEmailEnabled: input.monthlyEmailEnabled,
          categoryChangeEnabled: input.categoryChangeEnabled,
          volumeChangeEnabled: input.volumeChangeEnabled,
          updatedAt: '2026-08-12T13:00:00.000Z',
        };
      },
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'PUT',
      path: '/api/alert-preferences',
      headers: {
        authorization: 'Bearer valid-token',
      },
      body: {
        userId: 'another-user',
        monthlyEmailEnabled: false,
        categoryChangeEnabled: true,
        volumeChangeEnabled: false,
      },
    }),
    response,
    new URL('http://localhost/api/alert-preferences'),
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [{
    userId: '123e4567-e89b-12d3-a456-426614174000',
    input: {
      monthlyEmailEnabled: false,
      categoryChangeEnabled: true,
      volumeChangeEnabled: false,
    },
  }]);
  assert.deepEqual(JSON.parse(response.body), {
    email: 'member@example.com',
    monthlyEmailEnabled: false,
    categoryChangeEnabled: true,
    volumeChangeEnabled: false,
    updatedAt: '2026-08-12T13:00:00.000Z',
  });
  assert.ok(!response.body.includes('monthly_email_enabled'));
});
