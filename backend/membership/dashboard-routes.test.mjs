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

function createAnalysis(postcode) {
  return {
    postcode,
    crimeData: {
      month: '2026-05',
      crimeScore: postcode === 'SE10 8EP' ? 6 : 9,
      totalCrimes: postcode === 'SE10 8EP' ? 66 : 120,
      categories: [
        { category: 'violent-crime', count: postcode === 'SE10 8EP' ? 25 : 45 },
        { category: 'anti-social-behaviour', count: postcode === 'SE10 8EP' ? 16 : 20 },
      ],
      riskSignalDetails: [
        {
          roads: [{ name: 'On or near Blackheath Hill', count: 8 }],
          evidence: [{ persistentId: 'crime-1' }],
        },
      ],
    },
    trendData: {
      monthly: [
        { month: '2026-02', totalCrimes: 72 },
        { month: '2026-03', totalCrimes: 70 },
        { month: '2026-04', totalCrimes: 68 },
        { month: '2026-05', totalCrimes: 66 },
      ],
    },
    hotspotData: {
      clusters: [
        {
          roads: [{ name: 'On or near Blackheath Hill', count: 2 }],
          evidence: [{ persistentId: 'crime-2' }],
        },
      ],
    },
  };
}

function createDependencies(overrides = {}) {
  const premium = overrides.premium ?? true;
  const watchlistStore = overrides.watchlistStore || {
    async list() {
      return [];
    },
    async saveSnapshot() {
      return null;
    },
  };

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
    watchlistStore,
    analyzeLocation: overrides.analyzeLocation || (async (postcode) => createAnalysis(postcode)),
    fetchMonthlyCrimeSeries: overrides.fetchMonthlyCrimeSeries || (async () => ({
      monthly: [
        { month: '2026-02', totalCrimes: 72 },
        { month: '2026-03', totalCrimes: 70 },
        { month: '2026-04', totalCrimes: 68 },
        { month: '2026-05', totalCrimes: 66 },
      ],
      direction: 'cooling',
      changePercent: -8,
      categoryDirection: {
        violentCrimes: 'stable',
        antiSocialCrimes: 'cooling',
        robberyCrimes: 'stable',
      },
      summary: 'Recent incidents are cooling slightly.',
      dataQuality: {
        complete: true,
        requestedMonths: 4,
        loadedMonths: 4,
        failedMonths: [],
      },
    })),
  };
}

test('dashboard route enforces auth and premium access', async () => {
  const noAuthRoutes = createMembershipRouteHandler(createDependencies());
  const noAuthResponse = createResponse();

  await noAuthRoutes.handle(
    createRequest({ method: 'GET', path: '/api/dashboard' }),
    noAuthResponse,
    new URL('http://localhost/api/dashboard'),
  );

  assert.equal(noAuthResponse.statusCode, 401);

  const freeRoutes = createMembershipRouteHandler(createDependencies({ premium: false }));
  const freeResponse = createResponse();

  await freeRoutes.handle(
    createRequest({
      method: 'GET',
      path: '/api/dashboard',
      headers: { authorization: 'Bearer valid-token' },
    }),
    freeResponse,
    new URL('http://localhost/api/dashboard'),
  );

  assert.equal(freeResponse.statusCode, 403);
  assert.deepEqual(JSON.parse(freeResponse.body), {
    error: 'RiskRadar Premium is required for watched places.',
    code: 'PREMIUM_REQUIRED',
  });
});

test('dashboard route returns an honest empty watchlist view', async () => {
  const routes = createMembershipRouteHandler(createDependencies({
    watchlistStore: {
      async list() {
        return [];
      },
      async saveSnapshot() {
        throw new Error('unused');
      },
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/dashboard',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/dashboard'),
  );

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.deepEqual(payload.places, []);
  assert.equal(payload.selectedPlace, null);
  assert.match(payload.briefing.headline, /no watched places/i);
});

test('dashboard route tolerates one failed analysis and persists successful snapshots', async () => {
  const snapshotCalls = [];
  const routes = createMembershipRouteHandler(createDependencies({
    watchlistStore: {
      async list() {
        return [
          {
            id: 'watch-1',
            label: 'Home',
            postcode: 'SE10 8EP',
            normalizedPostcode: 'SE10 8EP',
            lastCheckedMonth: '2026-04',
            lastSnapshot: {
              dataMonth: '2026-04',
              score: 7,
              totalIncidents: 80,
              categories: [{ category: 'violent-crime', count: 20 }],
              trend: [
                { month: '2026-01', total: 82 },
                { month: '2026-02', total: 81 },
                { month: '2026-03', total: 80 },
              ],
              topRoads: [],
              generatedAt: '2026-07-12T10:00:00.000Z',
            },
          },
          {
            id: 'watch-2',
            label: 'Work',
            postcode: 'BR1 5NN',
            normalizedPostcode: 'BR1 5NN',
            lastCheckedMonth: null,
            lastSnapshot: null,
          },
        ];
      },
      async saveSnapshot(userId, watchId, payload) {
        snapshotCalls.push({ userId, watchId, payload });
      },
    },
    analyzeLocation: async (postcode) => {
      if (postcode === 'BR1 5NN') {
        throw new Error('Police.uk unavailable.');
      }
      return createAnalysis(postcode);
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/dashboard?watchId=watch-1',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/dashboard?watchId=watch-1'),
  );

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.selectedPlace.id, 'watch-1');
  assert.equal(payload.places[0].available, true);
  assert.equal(payload.places[1].available, false);
  assert.match(payload.places[1].error, /unavailable/i);
  assert.equal(snapshotCalls.length, 1);
  assert.equal(snapshotCalls[0].watchId, 'watch-1');
  assert.equal(snapshotCalls[0].payload.dataMonth, '2026-05');
});
