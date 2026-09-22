import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiveIncidentMapModel } from './presentation.ts';

const generatedAt = '2026-09-20T08:30:00.000Z';

function response(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt,
    query: { latitude: 51.5074, longitude: -0.1278, radiusKm: 10, limit: 50 },
    network: {
      status: 'healthy',
      durability: 'memory',
      persistent: false,
      disclosure: 'Live history resets when this development server restarts.',
      coverage: [{ id: 'environment-agency-floods-england', coverage: { countries: ['England'], regions: [], kind: 'flood' } }],
    },
    coverage: [{ countries: ['England'], regions: [], kind: 'flood' }],
    sources: [{ sourceId: 'environment-agency-floods-england', state: 'healthy', disclosure: 'Official England flood warnings are available.' }],
    incidents: [],
    disclaimer: 'RiskRadar provides current area intelligence from named sources.',
    ...overrides,
  };
}

function incident(overrides: Record<string, unknown> = {}) {
  return {
    id: 'incident-flood-1',
    fingerprint: 'fingerprint-1',
    provider: 'environment-agency',
    category: 'flood',
    subcategory: 'Flood warning',
    title: 'Flood warning for the River Test',
    summary: 'Flooding is expected around riverside roads.',
    status: 'active',
    publicationState: 'published',
    verificationLevel: 'Official',
    confidence: 0.98,
    severity: 4,
    geometry: { type: 'Point', coordinates: [-0.13, 51.51] },
    centroid: { latitude: 51.51, longitude: -0.13 },
    locationLabel: 'River Test at Central London',
    locationPrecision: 'exact-area',
    affectedRadiusMetres: 1_000,
    firstObservedAt: '2026-09-20T07:00:00.000Z',
    sourceOccurredAt: '2026-09-20T06:45:00.000Z',
    lastObservedAt: '2026-09-20T08:20:00.000Z',
    resolvedAt: null,
    expiresAt: '2026-09-20T09:05:00.000Z',
    independentSourceCount: 1,
    currentVersion: 2,
    createdAt: '2026-09-20T07:00:00.000Z',
    updatedAt: '2026-09-20T08:20:00.000Z',
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/example',
    sourceUpdatedAt: '2026-09-20T08:15:00.000Z',
    ...overrides,
  };
}

test('builds a source-backed marker with severity colour and factual labels', () => {
  const model = buildLiveIncidentMapModel(response({ incidents: [incident()] }));

  assert.equal(model.markers.length, 1);
  assert.deepEqual(model.markers[0], {
    id: 'incident-flood-1',
    latitude: 51.51,
    longitude: -0.13,
    title: 'Flood warning for the River Test',
    summary: 'Flooding is expected around riverside roads.',
    category: 'flood',
    categoryLabel: 'Flood warning',
    severity: 4,
    color: '#dc2626',
    softColor: '#fee2e2',
    affectedRadiusMetres: 1_000,
    providerLabel: 'Environment Agency',
    verificationLabel: 'Official',
    locationLabel: 'River Test at Central London',
    locationPrecisionLabel: 'Official affected area',
    sourceUpdatedAt: '2026-09-20T08:15:00.000Z',
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/example',
  });
  assert.equal(model.cards[0].updatedAtLabel, 'Updated 15 minutes ago');
  assert.equal(model.summary.title, '1 current official incident nearby');
  assert.equal(model.summary.tone, 'danger');
});

test('sorts incident cards by severity then newest source update', () => {
  const model = buildLiveIncidentMapModel(response({
    incidents: [
      incident({ id: 'low', severity: 2, sourceUpdatedAt: '2026-09-20T08:29:00.000Z' }),
      incident({ id: 'older-high', severity: 5, sourceUpdatedAt: '2026-09-20T08:00:00.000Z' }),
      incident({ id: 'newer-high', severity: 5, sourceUpdatedAt: '2026-09-20T08:25:00.000Z' }),
    ],
  }));

  assert.deepEqual(model.cards.map((card) => card.id), ['newer-high', 'older-high', 'low']);
  assert.equal(model.markers[0].color, '#be123c');
});

test('excludes malformed coordinates and unsafe source links from map output', () => {
  const model = buildLiveIncidentMapModel(response({
    incidents: [
      incident({ id: 'bad-coordinate', centroid: { latitude: 200, longitude: -0.13 } }),
      incident({ id: 'unsafe-link', sourceUrl: 'javascript:alert(1)' }),
    ],
  }));

  assert.deepEqual(model.markers.map((marker) => marker.id), ['unsafe-link']);
  assert.equal(model.markers[0].sourceUrl, null);
  assert.deepEqual(model.cards.map((card) => card.id), ['unsafe-link']);
});

test('distinguishes a healthy empty result from unavailable source coverage', () => {
  const healthy = buildLiveIncidentMapModel(response());
  const unavailable = buildLiveIncidentMapModel(response({
    network: {
      status: 'limited', durability: 'memory', persistent: false,
      disclosure: 'No live source has reported successfully.', coverage: [],
    },
    sources: [{ sourceId: 'environment-agency-floods-england', state: 'failed', disclosure: 'Official feed is temporarily unavailable.' }],
  }));

  assert.deepEqual(healthy.summary, {
    tone: 'clear',
    title: 'No current official incidents found nearby',
    detail: 'Connected sources reported no active incidents inside this 10 km view. Coverage is limited to the sources listed below.',
  });
  assert.deepEqual(unavailable.summary, {
    tone: 'limited',
    title: 'Live incident coverage is limited',
    detail: 'Official feed is temporarily unavailable.',
  });
});
