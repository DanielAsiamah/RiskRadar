import assert from 'node:assert/strict';
import test from 'node:test';

import { createRouteGuardRouteHandler } from './route-guard.mjs';

function createRequest(body, method = 'POST') {
  const chunks = body == null ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
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

test('POST /api/route-guard returns a mock route scan', async () => {
  const handler = createRouteGuardRouteHandler();
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
  await handler.handle(
    createRequest({ ...validBody, entitlement: 'free' }),
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
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('{not json');
    },
  };
  const invalidResponse = createResponse();
  await handler.handle(invalidRequest, invalidResponse, new URL('http://localhost/api/route-guard'));
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(JSON.parse(invalidResponse.body).code, 'INVALID_ROUTE_GUARD_INPUT');
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

test('free provider route failures fall back to mock without hiding entitlement errors', async () => {
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
  assert.equal(fallbackResponse.statusCode, 200);
  assert.equal(fallbackPayload.provider, 'mock');
  assert.match(fallbackPayload.fallbackReason, /OSRM offline/);

  const freeResponse = createResponse();
  await handler.handle(createRequest({ ...validBody, entitlement: 'free' }), freeResponse, new URL('http://localhost/api/route-guard'));
  assert.equal(freeResponse.statusCode, 403);
  assert.equal(JSON.parse(freeResponse.body).code, 'PREMIUM_REQUIRED');
});
