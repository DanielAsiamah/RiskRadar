import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveIncidentRouteHandler } from './routes.mjs';

function createRequest({ method = 'GET', body = null, headers = {} } = {}) {
  const chunks = body === null ? [] : [Buffer.from(JSON.stringify(body))];
  return { method, headers, [Symbol.asyncIterator]: async function* () { yield* chunks; } };
}

function createResponse() {
  return {
    statusCode: 0, headers: {}, body: '',
    writeHead(statusCode, headers) { this.statusCode = statusCode; this.headers = headers; },
    end(body = '') { this.body = body; },
  };
}

const pointAnalysis = {
  postcode: 'BR1 5NN',
  postcodeData: { latitude: 51.4062, longitude: 0.0186 },
  crimeData: { crimeScore: 34, timingContext: { adjustedScore: 36, totalAdjustment: 2, factors: [{ id: 'night', label: 'Late-night pressure', points: 2 }] } },
};

test('route refresh queries every sample and deduplicates overlapping incident results', async () => {
  const queried = [];
  const deps = dependencies();
  const incident = {
    id: 'destination-flood', category: 'flood', severity: 5, confidence: 1,
    affectedRadiusMetres: 500, publicationState: 'published', verificationLevel: 'Official',
    status: 'active', lastObservedAt: '2026-08-27T18:00:00.000Z',
    geometry: { type: 'Point', coordinates: [-1, 53] },
  };
  deps.store.listPublicIncidents = async ({ point }) => {
    queried.push(point.latitude);
    return point.latitude === 53 ? [incident, incident] : [];
  };
  const routes = createLiveIncidentRouteHandler(deps);
  const response = createResponse();
  await routes.handle(createRequest({ method: 'POST', body: { routeSamples: [
    { id: 'start', latitude: 51, longitude: -1 },
    { id: 'end', latitude: 53, longitude: -1 },
  ] } }), response, new URL('http://localhost/api/live-risk'));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(queried, [51, 53]);
  const payload = JSON.parse(response.body);
  assert.ok(payload.live.samples[1].liveScore > 36);
  assert.equal(payload.live.samples[1].contributors.length, 1);
});

function dependencies(overrides = {}) {
  return {
    store: {
      describeDurability: () => ({ driver: 'memory', durability: 'ephemeral', persistent: false, disclosure: 'Cleared on restart.' }),
      listSourceStates: async () => [{ sourceId: 'environment-agency-floods-england', state: 'healthy' }],
      listPublicIncidents: async () => [], getIncident: async () => null,
      listPublicVersions: async () => [], listPublicEvidence: async () => [],
    },
    ingestionService: { run: async () => ({ status: 'success', sourceId: 'environment-agency-floods-england' }) },
    sourceDefinitions: [{ id: 'environment-agency-floods-england', coverage: { countries: ['England'] } }],
    analyzeLocation: async () => pointAnalysis,
    analyzePoint: async () => pointAnalysis,
    ingestionSecret: 'test-secret-with-at-least-thirty-two-characters',
    now: () => new Date('2026-08-27T18:00:00.000Z'),
    ...overrides,
  };
}

test('nearby list returns bounded public network metadata', async () => {
  const routes = createLiveIncidentRouteHandler(dependencies());
  const response = createResponse();
  const handled = await routes.handle(createRequest(), response, new URL('http://localhost/api/live-incidents?lat=51.4062&lng=0.0186'));
  const payload = JSON.parse(response.body);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.query.radiusKm, 10);
  assert.equal(payload.query.limit, 50);
  assert.equal(payload.network.durability, 'ephemeral');
  assert.match(payload.disclaimer, /not an emergency service/);
});

test('live risk derives baseline and context from server analysis rather than client scores', async () => {
  const routes = createLiveIncidentRouteHandler(dependencies());
  const response = createResponse();
  await routes.handle(createRequest({ method: 'POST', body: { postcode: 'BR1 5NN', baselineScore: 100 } }), response, new URL('http://localhost/api/live-risk'));
  const payload = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.historical.baselineScore, 34);
  assert.equal(payload.context.contextScore, 36);
  assert.equal(payload.live.liveScore, 36);
});

test('invalid query and ingestion authentication receive stable errors', async () => {
  const routes = createLiveIncidentRouteHandler(dependencies());
  const invalid = createResponse();
  await routes.handle(createRequest(), invalid, new URL('http://localhost/api/live-incidents?lat=nope&lng=0'));
  assert.deepEqual(JSON.parse(invalid.body), { error: 'Latitude, longitude, radiusKm, and limit must be within the documented live-query bounds.', code: 'LIVE_QUERY_INVALID' });

  const unauthorised = createResponse();
  await routes.handle(createRequest({ method: 'POST', body: { sourceId: 'environment-agency-floods-england' } }), unauthorised, new URL('http://localhost/api/internal/live-ingestion/run'));
  assert.equal(unauthorised.statusCode, 401);
  assert.equal(JSON.parse(unauthorised.body).code, 'LIVE_INGESTION_UNAUTHORISED');
});

test('correct ingestion secret starts the named source once and unrelated paths are ignored', async () => {
  let requestedBy = null;
  const routes = createLiveIncidentRouteHandler(dependencies({ ingestionService: { run: async (input) => { requestedBy = input.requestedBy; return { status: 'success' }; } } }));
  const response = createResponse();
  await routes.handle(createRequest({ method: 'POST', headers: { 'x-live-ingestion-secret': 'test-secret-with-at-least-thirty-two-characters' }, body: { sourceId: 'environment-agency-floods-england' } }), response, new URL('http://localhost/api/internal/live-ingestion/run'));
  assert.equal(response.statusCode, 202);
  assert.equal(requestedBy, 'operator-api');
  assert.equal(await routes.handle(createRequest(), createResponse(), new URL('http://localhost/not-live')), false);
});
