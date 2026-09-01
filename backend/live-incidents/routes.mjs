import { timingSafeEqual } from 'node:crypto';

import { toPublicIncident } from './contracts.mjs';
import { calculateLiveRisk, calculateRouteLiveRisk } from './risk-overlay.mjs';

const MAX_BODY_BYTES = 8_192;
const DISCLAIMER = 'RiskRadar provides current area intelligence from named sources. It is not an emergency service and does not guarantee that a place or route is safe.';
const QUERY_ERROR = Object.freeze({
  error: 'Latitude, longitude, radiusKm, and limit must be within the documented live-query bounds.',
  code: 'LIVE_QUERY_INVALID',
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}

function validPoint(latitude, longitude) {
  return latitude !== null && longitude !== null && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function contextFor(analysis) {
  const baselineScore = analysis?.crimeData?.crimeScore;
  const timingContext = analysis?.crimeData?.timingContext ?? {};
  const contextScore = timingContext.adjustedScore ?? baselineScore;
  if (typeof baselineScore !== 'number' || !Number.isFinite(baselineScore) || typeof contextScore !== 'number' || !Number.isFinite(contextScore)) {
    throw new TypeError('Historical analysis did not include valid risk scores');
  }
  return { baselineScore, contextScore, contextAdjustments: timingContext.factors ?? [] };
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new RangeError('Request body is too large');
    chunks.push(bytes);
  }
  if (size === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('Request body must be an object');
    return value;
  } catch {
    throw new TypeError('Request body must be valid JSON');
  }
}

function authenticated(request, secret) {
  if (typeof secret !== 'string' || secret.length < 32) return null;
  const supplied = request.headers?.['x-live-ingestion-secret'];
  if (typeof supplied !== 'string') return false;
  const expectedBuffer = Buffer.from(secret);
  const suppliedBuffer = Buffer.from(supplied);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function networkMetadata(store, sourceDefinitions, states) {
  const durability = store.describeDurability();
  return {
    status: states.some((state) => state.state === 'healthy') ? 'healthy' : 'limited',
    durability: durability.durability,
    persistent: durability.persistent,
    disclosure: durability.disclosure,
    coverage: sourceDefinitions.map((source) => ({ id: source.id, coverage: source.coverage })),
  };
}

export function createLiveIncidentRouteHandler({
  store, ingestionService, sourceDefinitions = [], analyzeLocation, analyzePoint, ingestionSecret, now = () => new Date(),
} = {}) {
  if (!store || typeof store.listPublicIncidents !== 'function') throw new TypeError('store must support public incident queries');
  if (!ingestionService || typeof ingestionService.run !== 'function') throw new TypeError('ingestionService is required');
  if (typeof analyzeLocation !== 'function' || typeof analyzePoint !== 'function') throw new TypeError('analysis functions are required');

  async function incidentsNear(latitude, longitude, calculatedAt) {
    return store.listPublicIncidents({ point: { latitude, longitude }, radiusKm: 50, limit: 100, calculatedAt });
  }

  return Object.freeze({
    async handle(request, response, url) {
      if (request.method === 'GET' && url.pathname === '/api/live-incidents') {
        const latitude = number(url.searchParams.get('lat'));
        const longitude = number(url.searchParams.get('lng'));
        const radiusKm = number(url.searchParams.get('radiusKm') ?? 10);
        const limit = number(url.searchParams.get('limit') ?? 50);
        if (!validPoint(latitude, longitude) || radiusKm === null || radiusKm < 0.1 || radiusKm > 50 || !Number.isInteger(limit) || limit < 1 || limit > 100) {
          sendJson(response, 400, QUERY_ERROR);
          return true;
        }
        const generatedAt = now().toISOString();
        const [states, incidents] = await Promise.all([
          store.listSourceStates(),
          store.listPublicIncidents({ point: { latitude, longitude }, radiusKm, limit, calculatedAt: generatedAt }),
        ]);
        sendJson(response, 200, {
          generatedAt, query: { latitude, longitude, radiusKm, limit },
          network: networkMetadata(store, sourceDefinitions, states), coverage: sourceDefinitions.map((source) => source.coverage),
          sources: states, incidents, disclaimer: DISCLAIMER,
        });
        return true;
      }

      if (request.method === 'GET' && url.pathname.startsWith('/api/live-incidents/')) {
        const incidentId = decodeURIComponent(url.pathname.slice('/api/live-incidents/'.length));
        if (!incidentId || incidentId.includes('/')) return false;
        const incident = await store.getIncident(incidentId);
        if (!incident || !['published', 'preliminary'].includes(incident.publicationState)) {
          sendJson(response, 404, { error: 'Live incident was not found.', code: 'LIVE_INCIDENT_NOT_FOUND' });
          return true;
        }
        const states = await store.listSourceStates();
        sendJson(response, 200, {
          incident: toPublicIncident(incident), versions: await store.listPublicVersions(incidentId), evidence: await store.listPublicEvidence(incidentId),
          network: networkMetadata(store, sourceDefinitions, states), disclaimer: DISCLAIMER,
        });
        return true;
      }

      if (request.method === 'GET' && url.pathname === '/api/live-source-status') {
        const states = await store.listSourceStates();
        sendJson(response, 200, { generatedAt: now().toISOString(), network: networkMetadata(store, sourceDefinitions, states), sources: states, disclaimer: DISCLAIMER });
        return true;
      }

      if (request.method === 'POST' && url.pathname === '/api/live-risk') {
        let body;
        try { body = await readJson(request); } catch (error) {
          sendJson(response, 400, { error: error.message, code: 'LIVE_REQUEST_INVALID' });
          return true;
        }
        const calculatedAt = now().toISOString();
        try {
          if (typeof body.postcode === 'string' && body.postcode.trim()) {
            const analysis = await analyzeLocation(body.postcode.trim());
            const latitude = analysis?.postcodeData?.latitude;
            const longitude = analysis?.postcodeData?.longitude;
            if (!validPoint(latitude, longitude)) throw new TypeError('Postcode analysis did not include a valid location');
            const historical = contextFor(analysis);
            const live = calculateLiveRisk({ ...historical, incidents: await incidentsNear(latitude, longitude, calculatedAt), point: { latitude, longitude }, calculatedAt });
            sendJson(response, 200, { mode: 'postcode', postcode: analysis.postcode, point: { latitude, longitude }, historical: { baselineScore: historical.baselineScore }, context: { contextScore: historical.contextScore, adjustments: historical.contextAdjustments }, live, disclaimer: DISCLAIMER });
            return true;
          }
          if (validPoint(number(body.latitude), number(body.longitude))) {
            const latitude = number(body.latitude);
            const longitude = number(body.longitude);
            const analysis = await analyzePoint({ latitude, longitude });
            const historical = contextFor(analysis);
            const live = calculateLiveRisk({ ...historical, incidents: await incidentsNear(latitude, longitude, calculatedAt), point: { latitude, longitude }, calculatedAt });
            sendJson(response, 200, { mode: 'point', point: { latitude, longitude }, historical: { baselineScore: historical.baselineScore }, context: { contextScore: historical.contextScore, adjustments: historical.contextAdjustments }, live, disclaimer: DISCLAIMER });
            return true;
          }
          if (Array.isArray(body.routeSamples) && body.routeSamples.length >= 1 && body.routeSamples.length <= 12) {
            const samples = await Promise.all(body.routeSamples.map(async (sample, index) => {
              const latitude = number(sample?.latitude);
              const longitude = number(sample?.longitude);
              if (!validPoint(latitude, longitude)) throw new TypeError(`routeSamples[${index}] is invalid`);
              const analysis = await analyzePoint({ latitude, longitude });
              return { id: String(sample.id ?? `sample-${index + 1}`), latitude, longitude, ...contextFor(analysis) };
            }));
            const incidents = await incidentsNear(samples[0].latitude, samples[0].longitude, calculatedAt);
            const live = calculateRouteLiveRisk({ samples, incidents, calculatedAt });
            sendJson(response, 200, { mode: 'route', samples, live, disclaimer: DISCLAIMER });
            return true;
          }
          throw new TypeError('Provide exactly one postcode, point, or routeSamples request.');
        } catch (error) {
          sendJson(response, 400, { error: error.message, code: 'LIVE_REQUEST_INVALID' });
          return true;
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/internal/live-ingestion/run') {
        const auth = authenticated(request, ingestionSecret);
        if (auth === null) {
          sendJson(response, 503, { error: 'Live ingestion is not configured.', code: 'LIVE_INGESTION_NOT_CONFIGURED' });
          return true;
        }
        if (!auth) {
          sendJson(response, 401, { error: 'Live ingestion credential was not accepted.', code: 'LIVE_INGESTION_UNAUTHORISED' });
          return true;
        }
        try {
          const body = await readJson(request);
          const result = await ingestionService.run({ sourceId: body.sourceId, requestedBy: 'operator-api', force: body.force === true });
          sendJson(response, 202, result);
        } catch (error) {
          sendJson(response, 400, { error: error.message, code: 'LIVE_INGESTION_REQUEST_INVALID' });
        }
        return true;
      }
      return false;
    },
    async getReadiness() {
      const states = await store.listSourceStates();
      return networkMetadata(store, sourceDefinitions, states);
    },
  });
}
