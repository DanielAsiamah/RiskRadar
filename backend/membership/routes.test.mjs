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
      return null;
    },
  };
  const billing = overrides.billing || {
    buildCheckoutUrl() {
      return 'https://buy.stripe.com/test_checkout';
    },
    async createPortalUrl() {
      return 'https://billing.stripe.com/session/portal_123';
    },
    async processWebhook(rawBody, signature) {
      return {
        accepted: true,
        duplicate: false,
        rawBody,
        signature,
      };
    },
  };

  return {
    config: {
      configured: true,
      ...overrides.config,
    },
    store,
    billing,
  };
}

test('unconfigured GET /api/account returns unavailable entitlement', async () => {
  const routes = createMembershipRouteHandler(createDependencies({
    config: { configured: false },
  }));
  const request = createRequest({ method: 'GET', path: '/api/account' });
  const response = createResponse();

  const handled = await routes.handle(request, response, new URL('http://localhost/api/account'));

  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
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

test('missing bearer token returns AUTH_REQUIRED', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const request = createRequest({ method: 'GET', path: '/api/account' });
  const response = createResponse();

  await routes.handle(request, response, new URL('http://localhost/api/account'));

  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'A valid member session is required.',
    code: 'AUTH_REQUIRED',
  });
});

test('valid free user returns premium false', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const request = createRequest({
    method: 'GET',
    path: '/api/account',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
  const response = createResponse();

  await routes.handle(request, response, new URL('http://localhost/api/account'));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    configured: true,
    authenticated: true,
    email: 'member@example.com',
    status: 'free',
    premium: false,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    canManageBilling: false,
  });
});

test('checkout returns BILLING_UNAVAILABLE when membership is unconfigured', async () => {
  const routes = createMembershipRouteHandler(createDependencies({
    config: { configured: false },
  }));
  const request = createRequest({
    method: 'POST',
    path: '/api/billing/checkout-reference',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
  const response = createResponse();

  await routes.handle(request, response, new URL('http://localhost/api/billing/checkout-reference'));

  assert.equal(response.statusCode, 503);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'Premium billing is not configured on this deployment yet.',
    code: 'BILLING_UNAVAILABLE',
  });
});

test('checkout returns a checkoutUrl for a valid user', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const request = createRequest({
    method: 'POST',
    path: '/api/billing/checkout-reference',
    headers: {
      authorization: 'Bearer valid-token',
    },
  });
  const response = createResponse();

  await routes.handle(request, response, new URL('http://localhost/api/billing/checkout-reference'));

  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), {
    checkoutUrl: 'https://buy.stripe.com/test_checkout',
  });
});

test('portal requires a stored Stripe customer id', async () => {
  const routes = createMembershipRouteHandler(createDependencies({
    billing: {
      async createPortalUrl() {
        throw new Error('A stored Stripe customer is required.');
      },
    },
  }));
  const request = createRequest({
    method: 'POST',
    path: '/api/billing/customer-portal',
    headers: {
      authorization: 'Bearer valid-token',
    },
    body: {
      returnUrl: 'https://riskradar.app/account',
    },
  });
  const response = createResponse();

  await routes.handle(request, response, new URL('http://localhost/api/billing/customer-portal'));

  assert.equal(response.statusCode, 409);
  assert.match(JSON.parse(response.body).error, /stripe customer/i);
});

test('webhook requires stripe-signature and passes raw bytes unchanged', async () => {
  let captured = null;
  const routes = createMembershipRouteHandler(createDependencies({
    billing: {
      async processWebhook(rawBody, signature) {
        captured = { rawBody, signature };
        return {
          accepted: true,
          duplicate: false,
        };
      },
    },
  }));

  const missingSignatureResponse = createResponse();
  await routes.handle(
    createRequest({
      method: 'POST',
      path: '/api/billing/webhook',
      body: Buffer.from('{"test":true}'),
    }),
    missingSignatureResponse,
    new URL('http://localhost/api/billing/webhook'),
  );
  assert.equal(missingSignatureResponse.statusCode, 400);

  const rawBody = Buffer.from('{"test":true}');
  const response = createResponse();
  await routes.handle(
    createRequest({
      method: 'POST',
      path: '/api/billing/webhook',
      headers: {
        'stripe-signature': 'sig_123',
      },
      body: rawBody,
    }),
    response,
    new URL('http://localhost/api/billing/webhook'),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(captured.signature, 'sig_123');
  assert.ok(Buffer.isBuffer(captured.rawBody));
  assert.equal(captured.rawBody.toString('utf8'), rawBody.toString('utf8'));
});
