import assert from 'node:assert/strict';
import test from 'node:test';

import { createRouteGuardRouteHandler as createSecuredHandler } from './route-guard.mjs';
import { createRouteGuardAccess } from './route-guard-access.mjs';

const paidAccess = createRouteGuardAccess({
  config: { configured: true },
  now: () => Date.parse('2026-10-06T12:00:00Z'),
  store: {
    verifyAccessToken: async () => ({ id: 'user-1' }),
    getSubscription: async () => ({ user_id: 'user-1', status: 'active', current_period_end: '2026-11-01T00:00:00Z' }),
  },
});
const createRouteGuardRouteHandler = (options = {}) => createSecuredHandler({ access: paidAccess, ...options });

function createRequest(body, method = 'POST') {
  const chunks = body == null ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers: { authorization: 'Bearer test-token' },
    [Symbol.asyncIterator]: async function* () {
      yield* chunks;
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

const validBody = {
  start: 'SE10 8EP',
  destination: 'London Bridge',
  travelMode: 'transit',
  entitlement: 'pro',
  routeScansUsed: 4,
};

test('initial real route scan includes live-source availability and tolerates a source-status outage', async () => {
  const liveData = { checkedAt: '2026-10-13T12:00:00Z', scope: 'source-network', status: 'unavailable', sources: [] };
  for (const failed of [false, true]) {
    const handler = createRouteGuardRouteHandler({
      provider: 'free-osm',
      geocodeLocation: async (query) => ({ latitude: 51.5, longitude: -0.1, label: query }),
      fetchRoute: async () => ({
        routePoints: [{ latitude: 51.5, longitude: -0.1 }, { latitude: 51.51, longitude: -0.1 }],
        distanceMetres: 1100, durationSeconds: 800,
      }),
      sampleRisk: async () => ({ score: 20, basis: 'Historical baseline' }),
      getLiveDataStatus: async () => { if (failed) throw new Error('Store unavailable'); return liveData; },
    });
    const response = createResponse();
    await handler.handle(createRequest(validBody), response, new URL('http://localhost/api/route-guard'));
    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.liveData?.status, 'unavailable');
    assert.equal(payload.overallRiskScore, 20);
    if (!failed) assert.deepEqual(payload.liveData, liveData);
  }
});

test('route API fails closed without a server access policy even when the body claims PRO', async () => {
  const handler = createSecuredHandler({ provider: 'mock' });
  const response = createResponse();
  await handler.handle(createRequest(validBody), response, new URL('http://localhost/api/route-guard'));
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).code, 'ROUTE_GUARD_AUTH_UNAVAILABLE');
});

test('local development scans override client entitlement and do not consume the paid allowance', async () => {
  const handler = createRouteGuardRouteHandler({
    provider: 'mock',
    access: {
      describe: () => ({ localDevelopment: true }),
      authorize: async () => ({ mode: 'local-development' }),
    },
  });
  const response = createResponse();
  await handler.handle(createRequest({ ...validBody, entitlement: 'free', routeScansUsed: 100 }), response, new URL('http://localhost/api/route-guard'));
  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.access.mode, 'local-development');
  assert.equal(payload.usage.usedBefore, 0);
});

test('POST /api/route-guard returns a mock route scan', async () => {
  const handler = createRouteGuardRouteHandler({ provider: 'mock' });
  const response = createResponse();

  const handled = await handler.handle(
    createRequest(validBody),
    response,
    new URL('http://localhost/api/route-guard'),
  );

  const payload = JSON.parse(response.body);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Content-Type'], /application\/json/);
  assert.equal(payload.provider, 'mock');
  assert.equal(payload.googleRequestMade, false);
  assert.equal(payload.usage.usedAfter, 5);
});

test('POST /api/route-guard returns structured entitlement and limit errors', async () => {
  const handler = createRouteGuardRouteHandler();

  const freeResponse = createResponse();
  const freeHandler = createRouteGuardRouteHandler({ access: createRouteGuardAccess({
    config: { configured: true },
    store: { verifyAccessToken: async () => ({ id: 'free-user' }), getSubscription: async () => null },
  }) });
  await freeHandler.handle(
    createRequest({ ...validBody, entitlement: 'pro' }),
    freeResponse,
    new URL('http://localhost/api/route-guard'),
  );
  assert.equal(freeResponse.statusCode, 403);
  assert.equal(JSON.parse(freeResponse.body).code, 'PREMIUM_REQUIRED');

  const limitResponse = createResponse();
  await handler.handle(
    createRequest({ ...validBody, routeScansUsed: 100 }),
    limitResponse,
    new URL('http://localhost/api/route-guard'),
  );
  assert.equal(limitResponse.statusCode, 429);
  assert.equal(JSON.parse(limitResponse.body).code, 'ROUTE_SCAN_LIMIT_REACHED');
});

test('route guard handler ignores other routes and rejects invalid JSON', async () => {
  const handler = createRouteGuardRouteHandler();
  const ignoredResponse = createResponse();
  const ignored = await handler.handle(
    createRequest(validBody, 'GET'),
    ignoredResponse,
    new URL('http://localhost/api/route-guard'),
  );
  assert.equal(ignored, false);

  const invalidRequest = {
    method: 'POST',
    headers: { authorization: 'Bearer test-token' },
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('{not json');
    },
  };
  const invalidResponse = createResponse();
  await handler.handle(invalidRequest, invalidResponse, new URL('http://localhost/api/route-guard'));
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(JSON.parse(invalidResponse.body).code, 'INVALID_ROUTE_GUARD_INPUT');
});

test('GET /api/route-guard/status returns provider readiness without requiring Google', async () => {
  const handler = createRouteGuardRouteHandler({ provider: 'free-osm' });
  const response = createResponse();

  const handled = await handler.handle(
    createRequest(null, 'GET'),
    response,
    new URL('http://localhost/api/route-guard/status'),
  );

  const payload = JSON.parse(response.body);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.provider, 'free-osm');
  assert.equal(payload.ready, true);
  assert.equal(payload.google.required, false);
  assert.equal(payload.google.configured, false);
  assert.equal(payload.usage.includedMonthlyScans, 100);
});

test('POST /api/route-guard can return a free OSM-backed route scan', async () => {
  const handler = createRouteGuardRouteHandler({
    provider: 'free-osm',
    geocodeLocation: async (query) => ({
      query,
      label: `${query} resolved`,
      latitude: query === validBody.start ? 51.47 : 51.5,
      longitude: query === validBody.start ? -0.02 : -0.08,
      confidence: 'high',
      source: 'test-geocoder',
    }),
    fetchRoute: async ({ startPoint, destinationPoint, routingProfile }) => ({
      provider: 'free-osm',
      routingMode: routingProfile,
      distanceMetres: 4000,
      durationSeconds: 3600,
      routePoints: [startPoint, { latitude: 51.485, longitude: -0.05 }, destinationPoint],
      attribution: 'OpenStreetMap contributors; OSRM',
    }),
    sampleRisk: async (_point, index) => ({ score: [30, 78, 44][index], basis: 'test live risk' }),
  });
  const response = createResponse();

  await handler.handle(createRequest(validBody), response, new URL('http://localhost/api/route-guard'));

  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.provider, 'free-osm');
  assert.equal(payload.googleRequestMade, false);
  assert.equal(payload.googleCostEstimate.estimatedRequests, 0);
  assert.equal(payload.sampledRiskScores[1].riskLevel, 'red');
});

test('POST /api/route-guard accepts current-location coordinates for the route start', async () => {
  const geocodedQueries = [];
  const handler = createRouteGuardRouteHandler({
    provider: 'free-osm',
    geocodeLocation: async (query) => {
      geocodedQueries.push(query);
      return {
        query,
        label: 'London Bridge resolved',
        latitude: 51.5,
        longitude: -0.08,
        confidence: 'high',
        source: 'test-geocoder',
      };
    },
    fetchRoute: async ({ startPoint, destinationPoint }) => ({
      provider: 'free-osm',
      routingMode: 'foot',
      distanceMetres: 900,
      durationSeconds: 720,
      routePoints: [startPoint, destinationPoint],
      attribution: 'OpenStreetMap contributors; OSRM',
    }),
    sampleRisk: async () => ({ score: 31, basis: 'test route risk' }),
  });
  const response = createResponse();

  await handler.handle(
    createRequest({ ...validBody, start: '', startCoordinates: { latitude: 51.4762, longitude: -0.0005 } }),
    response,
    new URL('http://localhost/api/route-guard'),
  );

  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(geocodedQueries, [validBody.destination]);
  assert.equal(payload.start, 'Current location');
  assert.equal(payload.geocoded.start.source, 'device-location');
});

test('POST /api/route-guard rejects invalid current-location coordinates', async () => {
  const handler = createRouteGuardRouteHandler({ provider: 'free-osm' });
  const response = createResponse();

  await handler.handle(
    createRequest({ ...validBody, start: '', startCoordinates: { latitude: 999, longitude: -0.0005 } }),
    response,
    new URL('http://localhost/api/route-guard'),
  );

  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).code, 'INVALID_ROUTE_GUARD_INPUT');
});

test('real routing failures return an error, never generated geometry or a consumed scan', async () => {
  const handler = createRouteGuardRouteHandler({
    provider: 'free-osm',
    geocodeLocation: async (query) => ({
      query,
      label: query,
      latitude: query === validBody.start ? 51.47 : 51.5,
      longitude: query === validBody.start ? -0.02 : -0.08,
      confidence: 'high',
      source: 'test-geocoder',
    }),
    fetchRoute: async () => {
      throw new Error('OSRM offline');
    },
  });

  const fallbackResponse = createResponse();
  await handler.handle(createRequest(validBody), fallbackResponse, new URL('http://localhost/api/route-guard'));
  const fallbackPayload = JSON.parse(fallbackResponse.body);
  assert.equal(fallbackResponse.statusCode, 502);
  assert.equal(fallbackPayload.code, 'ROUTE_PROVIDER_FAILED');
  assert.equal(fallbackPayload.provider, undefined);
  assert.equal(fallbackPayload.routePoints, undefined);
  assert.equal(fallbackPayload.usage, undefined);

  const freeResponse = createResponse();
  const unsignedRequest = { ...createRequest(validBody), headers: {} };
  await handler.handle(unsignedRequest, freeResponse, new URL('http://localhost/api/route-guard'));
  assert.equal(freeResponse.statusCode, 401);
  assert.equal(JSON.parse(freeResponse.body).code, 'AUTHENTICATION_REQUIRED');
});

test('status exposes local access only for requests accepted by the actual access policy', async () => {
  const handler = createSecuredHandler({
    access: createRouteGuardAccess({ env: { NODE_ENV: 'development', ROUTE_GUARD_LOCAL_DEVELOPMENT: 'true' }, host: '127.0.0.1', port: 3001 }),
  });
  for (const [remoteAddress, localDevelopment] of [['127.0.0.1', true], ['192.168.1.1', false]]) {
    const response = createResponse();
    await handler.handle({ method: 'GET', headers: { host: 'localhost:3001' }, socket: { remoteAddress } }, response, new URL('http://localhost:3001/api/route-guard/status'));
    const payload = JSON.parse(response.body);
    assert.equal(payload.access.localDevelopment, localDevelopment);
    assert.equal(payload.supabase.requiredForRouteScan, !localDevelopment);
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});

test('custom server responses also prevent caching request-specific access status', async () => {
  let sentHeaders;
  const handler = createRouteGuardRouteHandler({
    sendJson: (_request, _response, _status, _body, headers) => { sentHeaders = headers; },
  });
  await handler.handle(createRequest(null, 'GET'), createResponse(), new URL('http://localhost/api/route-guard/status'));
  assert.equal(sentHeaders?.['Cache-Control'], 'no-store');
});

test('non-object JSON bodies return a validation error after authorization', async () => {
  const handler = createRouteGuardRouteHandler({ provider: 'mock' });
  for (const value of [null, [], 'pro', 42]) {
    const response = createResponse();
    const request = {
      method: 'POST', headers: { authorization: 'Bearer test-token' },
      [Symbol.asyncIterator]: async function* () { yield Buffer.from(JSON.stringify(value)); },
    };
    await handler.handle(request, response, new URL('http://localhost/api/route-guard'));
    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).code, 'INVALID_ROUTE_GUARD_INPUT');
  }
});

test('the default route provider is real routing rather than a generated preview', async () => {
  const handler = createRouteGuardRouteHandler();
  const response = createResponse();
  await handler.handle(createRequest(null, 'GET'), response, new URL('http://localhost/api/route-guard/status'));
  assert.equal(JSON.parse(response.body).provider, 'free-osm');
});
