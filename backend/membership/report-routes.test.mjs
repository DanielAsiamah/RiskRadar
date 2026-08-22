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
      monthDisplay: 'May 2026',
      crimeScore: 6,
      safetyLevel: 'low risk',
      totalCrimes: 66,
      postcodeRadiusMeters: 400,
      categories: [
        { category: 'violent-crime', count: 25 },
        { category: 'anti-social-behaviour', count: 16 },
      ],
      scoreMethod: {
        id: 'postcode-blend-v2',
        name: 'RiskRadar Postcode Blend',
        modelCap: 20,
      },
      capExplanation: 'This postcode score uses a conservative local-plus-context cap.',
      scoreFactors: [
        {
          label: 'Violent crime remains the largest local severity driver.',
          impact: 'up',
          detail: 'Violent crime still contributes the largest share of local severity points.',
        },
      ],
      riskSignalDetails: [
        {
          roads: [{ name: 'On or near Blackheath Hill', count: 8 }],
          evidence: [
            {
              persistentId: 'crime-1',
              category: 'violent-crime',
              categoryLabel: 'Violent Crime',
              month: '2026-05',
              locationStreet: 'On or near Blackheath Hill',
              officialCaseUrl: 'https://data.police.uk/outcomes-for-crime/crime-1',
            },
          ],
        },
      ],
    },
    postcodeData: {
      admin_district: 'Lewisham',
      longitude: -0.01,
      latitude: 51.48,
      postcode: 'SE10 8EP',
    },
    aiAnalysis: {
      summary: 'Lewisham currently scores low risk because of the latest incident volume, the severity mix of recorded offences, and the way those incidents are concentrated around the area.',
      whatToAvoid: [],
      safetyTips: [],
      localVibe: 'Urban',
      scoreStory: [],
      areaContext: 'Road labels and evidence come from anonymised Police.uk monthly records.',
    },
    trendData: {
      monthly: [
        { month: '2026-02', monthDisplay: 'February 2026', totalCrimes: 72, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        { month: '2026-03', monthDisplay: 'March 2026', totalCrimes: 70, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        { month: '2026-04', monthDisplay: 'April 2026', totalCrimes: 68, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        { month: '2026-05', monthDisplay: 'May 2026', totalCrimes: 66, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
      ],
      direction: 'cooling',
      changePercent: -11,
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
    },
    hotspotData: {
      summary: 'Clusters remain concentrated around Blackheath Hill and nearby station routes.',
      clusters: [
        {
          roads: [
            { name: 'On or near Blackheath Hill', count: 3 },
            { name: 'On or near Lewisham Dlr', count: 2 },
          ],
          evidence: [
            {
              persistentId: 'crime-2',
              category: 'anti-social-behaviour',
              categoryLabel: 'Anti Social Behaviour',
              month: '2026-05',
              locationStreet: 'On or near Lewisham Dlr',
              officialCaseUrl: 'https://data.police.uk/outcomes-for-crime/crime-2',
            },
          ],
        },
      ],
    },
    newsLink: 'https://news.google.com/search?q=Lewisham%20crime',
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
      billingReferenceSecret: '0123456789abcdef0123456789abcdef',
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
        { month: '2026-02', monthDisplay: 'February 2026', totalCrimes: 72, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        { month: '2026-03', monthDisplay: 'March 2026', totalCrimes: 70, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        { month: '2026-04', monthDisplay: 'April 2026', totalCrimes: 68, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        { month: '2026-05', monthDisplay: 'May 2026', totalCrimes: 66, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
      ],
      direction: 'cooling',
      changePercent: -11,
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

test('report route enforces auth, premium access, and ownership', async () => {
  const noAuthRoutes = createMembershipRouteHandler(createDependencies());
  const noAuthResponse = createResponse();

  await noAuthRoutes.handle(
    createRequest({ method: 'GET', path: '/api/reports/watch-1' }),
    noAuthResponse,
    new URL('http://localhost/api/reports/watch-1'),
  );

  assert.equal(noAuthResponse.statusCode, 401);

  const freeRoutes = createMembershipRouteHandler(createDependencies({ premium: false }));
  const freeResponse = createResponse();

  await freeRoutes.handle(
    createRequest({
      method: 'GET',
      path: '/api/reports/watch-1',
      headers: { authorization: 'Bearer valid-token' },
    }),
    freeResponse,
    new URL('http://localhost/api/reports/watch-1'),
  );

  assert.equal(freeResponse.statusCode, 403);

  const missingRoutes = createMembershipRouteHandler(createDependencies({
    watchlistStore: {
      async list() {
        return [];
      },
      async saveSnapshot() {
        throw new Error('unused');
      },
    },
  }));
  const missingResponse = createResponse();

  await missingRoutes.handle(
    createRequest({
      method: 'GET',
      path: '/api/reports/watch-1',
      headers: { authorization: 'Bearer valid-token' },
    }),
    missingResponse,
    new URL('http://localhost/api/reports/watch-1'),
  );

  assert.equal(missingResponse.statusCode, 404);
  assert.deepEqual(JSON.parse(missingResponse.body), {
    error: 'Watched place not found.',
    code: 'WATCH_NOT_FOUND',
  });
});

test('report route returns a private report view for an owned watched place', async () => {
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
              categories: [
                { category: 'violent-crime', count: 28 },
                { category: 'anti-social-behaviour', count: 17 },
              ],
              trend: [
                { month: '2026-01', total: 82 },
                { month: '2026-02', total: 80 },
                { month: '2026-03', total: 78 },
                { month: '2026-04', total: 74 },
              ],
              topRoads: [{ name: 'On or near Blackheath Hill', count: 9 }],
              generatedAt: '2026-07-12T10:00:00.000Z',
            },
          },
        ];
      },
      async saveSnapshot(userId, watchId, payload) {
        snapshotCalls.push({ userId, watchId, payload });
      },
    },
  }));
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/reports/watch-1',
      headers: { authorization: 'Bearer valid-token' },
    }),
    response,
    new URL('http://localhost/api/reports/watch-1'),
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  const payload = JSON.parse(response.body);
  assert.equal(payload.watchId, 'watch-1');
  assert.equal(payload.label, 'Home');
  assert.equal(payload.postcode, 'SE10 8EP');
  assert.equal(payload.dataMonth, '2026-05');
  assert.equal(payload.score, 6);
  assert.equal(payload.categoryChanges[0].label, 'Violent Crime');
  assert.equal(payload.officialEvidence.length, 2);
  assert.match(payload.disclaimer, /informational risk estimate/i);
  assert.equal(snapshotCalls.length, 1);
  assert.equal(snapshotCalls[0].watchId, 'watch-1');
  assert.equal(snapshotCalls[0].payload.dataMonth, '2026-05');
});

test('report routes create a share link and resolve a public shared report view', async () => {
  const routes = createMembershipRouteHandler(createDependencies({
    watchlistStore: {
      async list(userId) {
        assert.equal(userId, '123e4567-e89b-12d3-a456-426614174000');
        return [
          {
            id: 'watch-1',
            label: 'Home',
            postcode: 'SE10 8EP',
            normalizedPostcode: 'SE10 8EP',
            lastCheckedMonth: '2026-05',
            lastSnapshot: {
              dataMonth: '2026-05',
              score: 6,
              totalIncidents: 66,
              categories: [
                { category: 'violent-crime', count: 25 },
              ],
              trend: [
                { month: '2026-04', total: 68 },
                { month: '2026-05', total: 66 },
              ],
              topRoads: [{ name: 'On or near Blackheath Hill', count: 8 }],
              generatedAt: '2026-08-12T10:00:00.000Z',
            },
          },
        ];
      },
      async saveSnapshot() {
        throw new Error('share flow should not persist snapshots');
      },
    },
  }));

  const shareResponse = createResponse();
  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/reports/watch-1/share',
      headers: { authorization: 'Bearer valid-token' },
    }),
    shareResponse,
    new URL('http://localhost/api/reports/watch-1/share'),
  );

  assert.equal(shareResponse.statusCode, 200);
  const sharePayload = JSON.parse(shareResponse.body);
  assert.match(sharePayload.shareUrl, /\?report=/);
  assert.match(sharePayload.expiresAt, /^20/);

  const shareUrl = new URL(sharePayload.shareUrl);
  const token = shareUrl.searchParams.get('report');
  assert.ok(token);

  const publicResponse = createResponse();
  await routes.handle(
    createRequest({
      method: 'GET',
      path: `/api/report-share?token=${encodeURIComponent(token)}`,
    }),
    publicResponse,
    new URL(`http://localhost/api/report-share?token=${encodeURIComponent(token)}`),
  );

  assert.equal(publicResponse.statusCode, 200);
  assert.equal(publicResponse.headers['Cache-Control'], 'public, max-age=300');
  const sharedReport = JSON.parse(publicResponse.body);
  assert.equal(sharedReport.watchId, '');
  assert.equal(sharedReport.label, 'SE10 8EP');
  assert.equal(sharedReport.postcode, 'SE10 8EP');
  assert.match(sharedReport.disclaimer, /shared links/i);
});

test('report share route rejects a malformed token safely', async () => {
  const routes = createMembershipRouteHandler(createDependencies());
  const response = createResponse();

  await routes.handle(
    createRequest({
      method: 'GET',
      path: '/api/report-share?token=not-a-valid-token',
    }),
    response,
    new URL('http://localhost/api/report-share?token=not-a-valid-token'),
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(JSON.parse(response.body), {
    error: 'A valid report share token is required.',
    code: 'INVALID_SHARE_TOKEN',
  });
});
