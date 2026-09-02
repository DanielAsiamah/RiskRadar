import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INCIDENT_CATEGORIES,
  INCIDENT_POLICY_VERSION,
  INCIDENT_SCHEMA_VERSION,
  INCIDENT_STATUSES,
  LOCATION_PRECISIONS,
  PUBLICATION_STATES,
  SOURCE_HEALTH_STATES,
  VERIFICATION_LEVELS,
  assertIncidentTransition,
  createSourceObservation,
  normalizeIncidentDraft,
  toPublicIncident,
  toPublicVersion,
} from './contracts.mjs';
import {
  centroidForGeometry,
  distanceToGeometryMetres,
  normalizeGeoJsonGeometry,
} from './geometry.mjs';

const capturedAt = '2026-08-27T18:00:00.000Z';
const observationInput = {
  provider: 'environment-agency',
  providerTier: 1,
  externalId: '034WAF428',
  sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
  sourcePublishedAt: '2026-08-27T16:09:22.000Z',
  sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
  rawPayload: { severityLevel: 3, description: 'Lower River Soar' },
  ingestionRunId: 'run-ea-001',
  validationState: 'valid',
  validationErrors: [],
};

const incidentInput = {
  provider: 'environment-agency',
  externalId: '034WAF428',
  category: 'flood',
  subcategory: 'flood-alert',
  title: 'Flood alert: Lower River Soar',
  summary: 'Flooding is possible.',
  status: 'active',
  severity: 2,
  geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] },
  centroid: { latitude: 52.79207, longitude: -1.21257 },
  locationLabel: 'Lower River Soar in Leicestershire',
  locationPrecision: 'exact-area',
  affectedRadiusMetres: 1000,
  sourceOccurredAt: '2026-08-27T16:09:22.000Z',
  expiresAt: '2026-08-27T19:00:00.000Z',
};

test('canonical constants retain the approved live incident vocabulary', () => {
  assert.equal(INCIDENT_SCHEMA_VERSION, 'live-incident-v1');
  assert.equal(INCIDENT_POLICY_VERSION, 'live-publication-v1');
  assert.deepEqual(INCIDENT_CATEGORIES, [
    'flood',
    'road-collision',
    'road-closure',
    'transport-disruption',
    'fire',
    'hazardous-material',
    'severe-weather',
    'police-activity',
    'violent-incident',
    'public-safety',
    'other',
  ]);
  assert.deepEqual(INCIDENT_STATUSES, [
    'detected',
    'corroborating',
    'active',
    'updated',
    'resolving',
    'resolved',
    'retracted',
  ]);
  assert.deepEqual(PUBLICATION_STATES, ['published', 'preliminary', 'review', 'rejected']);
  assert.deepEqual(VERIFICATION_LEVELS, ['Official', 'Corroborated', 'Preliminary', 'Unverified']);
  assert.deepEqual(LOCATION_PRECISIONS, ['exact-area', 'road-segment', 'postcode-sector', 'district', 'unknown']);
  assert.deepEqual(SOURCE_HEALTH_STATES, ['enabled', 'healthy', 'stale', 'failed', 'disabled', 'not-configured']);
});

test('source observations are deterministic, immutable, and retain private evidence', () => {
  const first = createSourceObservation({
    ...observationInput,
    id: 'caller-controlled',
    payloadHash: 'caller-controlled',
  }, { capturedAt });
  const second = createSourceObservation({
    ...observationInput,
    rawPayload: { description: 'Lower River Soar', severityLevel: 3 },
  }, { capturedAt });

  assert.equal(first.id, second.id);
  assert.equal(first.payloadHash, second.payloadHash);
  assert.notEqual(first.id, 'caller-controlled');
  assert.notEqual(first.payloadHash, 'caller-controlled');
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rawPayload), true);
  assert.notEqual(first.rawPayload, observationInput.rawPayload);
  assert.deepEqual(first.rawPayload, observationInput.rawPayload);
});

test('source observations reject invalid source and capture timestamps', () => {
  assert.throws(
    () => createSourceObservation({ ...observationInput, sourceUpdatedAt: 'yesterday' }, { capturedAt }),
    /sourceUpdatedAt/,
  );
  assert.throws(
    () => createSourceObservation(observationInput, { capturedAt: 'not-a-date' }),
    /capturedAt/,
  );
});

test('incident drafts trim factual copy and reject invalid values', () => {
  const draft = normalizeIncidentDraft({
    ...incidentInput,
    title: '  Flood alert: Lower River Soar  ',
    summary: '  Flooding is possible.  ',
  });
  assert.equal(draft.title, 'Flood alert: Lower River Soar');
  assert.equal(draft.summary, 'Flooding is possible.');
  assert.equal(Object.isFrozen(draft), true);

  assert.throws(() => normalizeIncidentDraft({ ...incidentInput, category: 'earthquake' }), /category/);
  assert.throws(() => normalizeIncidentDraft({ ...incidentInput, severity: 0 }), /severity/);
  assert.throws(() => normalizeIncidentDraft({ ...incidentInput, affectedRadiusMetres: 100001 }), /affectedRadiusMetres/);
  assert.throws(() => normalizeIncidentDraft({ ...incidentInput, locationPrecision: 'street-address' }), /locationPrecision/);
  assert.throws(() => normalizeIncidentDraft({ ...incidentInput, sourceOccurredAt: 'invalid' }), /sourceOccurredAt/);
});

test('lifecycle rejects a resolved incident becoming active', () => {
  assert.equal(assertIncidentTransition('active', 'updated'), true);
  assert.equal(assertIncidentTransition('updated', 'resolving'), true);
  assert.equal(assertIncidentTransition('resolving', 'resolved'), true);
  assert.equal(assertIncidentTransition('updated', 'updated'), true);
  assert.throws(
    () => assertIncidentTransition('resolved', 'active'),
    /Illegal live incident transition/,
  );
  assert.throws(
    () => assertIncidentTransition('unknown', 'active'),
    /Unknown live incident status/,
  );
});

test('public incidents exclude backend evidence and source-key internals', () => {
  const draft = normalizeIncidentDraft(incidentInput);
  const publicIncident = toPublicIncident({
    ...draft,
    id: 'inc_123',
    fingerprint: 'fp_123',
    publicationState: 'published',
    verificationLevel: 'Official',
    confidence: 0.98,
    sourceUrl: observationInput.sourceUrl,
    sourceUpdatedAt: observationInput.sourceUpdatedAt,
    riskConstraints: {
      maxScoreDelta: null,
      canTriggerMajorAlert: true,
      canTriggerRouteAvoidance: true,
    },
    firstObservedAt: capturedAt,
    lastObservedAt: capturedAt,
    resolvedAt: null,
    primarySourceObservationId: 'obs_123',
    independentSourceCount: 1,
    currentVersion: 1,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    sourceKeys: ['environment-agency:034WAF428'],
    rawPayload: { mustNotLeak: true },
  });

  assert.equal(publicIncident.provider, 'environment-agency');
  assert.equal(publicIncident.sourceUrl, observationInput.sourceUrl);
  assert.deepEqual(publicIncident.riskConstraints, {
    maxScoreDelta: null,
    canTriggerMajorAlert: true,
    canTriggerRouteAvoidance: true,
  });
  assert.equal('rawPayload' in publicIncident, false);
  assert.equal('sourceKeys' in publicIncident, false);
  assert.equal('primarySourceObservationId' in publicIncident, false);
});

test('public versions expose only the allow-listed snapshot and change metadata', () => {
  const version = toPublicVersion({
    incidentId: 'inc_123',
    version: 2,
    changedFields: ['status', 'summary'],
    reason: 'source-update',
    createdAt: capturedAt,
    sourceObservationIds: ['obs_private'],
    rawPayload: { mustNotLeak: true },
    snapshot: {
      id: 'inc_123',
      provider: 'environment-agency',
      title: 'Flood alert: Lower River Soar',
      rawPayload: { mustNotLeak: true },
    },
  });

  assert.deepEqual(version, {
    version: 2,
    changedFields: ['status', 'summary'],
    reason: 'source-update',
    createdAt: capturedAt,
    snapshot: {
      id: 'inc_123',
      provider: 'environment-agency',
      title: 'Flood alert: Lower River Soar',
    },
  });
});

test('public projections reconstruct nested metadata without leaking nested source evidence', () => {
  const incident = {
    ...normalizeIncidentDraft(incidentInput),
    id: 'inc_123',
    fingerprint: 'fp_123',
    publicationState: 'published',
    verificationLevel: 'Official',
    confidence: 0.98,
    sourceUrl: observationInput.sourceUrl,
    sourceUpdatedAt: observationInput.sourceUpdatedAt,
    riskConstraints: {
      maxScoreDelta: 12,
      canTriggerMajorAlert: true,
      canTriggerRouteAvoidance: false,
      sourceApiKey: 'must-not-leak',
    },
    geometry: {
      type: 'Point',
      coordinates: [-1.21257, 52.79207],
      rawPayload: { privateAddress: 'must-not-leak' },
    },
    centroid: {
      latitude: 52.79207,
      longitude: -1.21257,
      privateAddress: 'must-not-leak',
    },
  };

  const publicIncident = toPublicIncident(incident);
  const publicVersion = toPublicVersion({
    version: 1,
    changedFields: ['status'],
    reason: 'source-update',
    createdAt: capturedAt,
    snapshot: incident,
  });

  assert.deepEqual(publicIncident.geometry, {
    type: 'Point',
    coordinates: [-1.21257, 52.79207],
  });
  assert.deepEqual(publicIncident.centroid, {
    latitude: 52.79207,
    longitude: -1.21257,
  });
  assert.deepEqual(publicIncident.riskConstraints, {
    maxScoreDelta: 12,
    canTriggerMajorAlert: true,
    canTriggerRouteAvoidance: false,
  });
  assert.equal('rawPayload' in publicIncident.geometry, false);
  assert.equal('privateAddress' in publicIncident.centroid, false);
  assert.equal('sourceApiKey' in publicIncident.riskConstraints, false);
  assert.deepEqual(publicVersion.snapshot.geometry, publicIncident.geometry);
});

test('public projections reject malformed canonical metadata', () => {
  const incident = {
    ...normalizeIncidentDraft(incidentInput),
    id: 'inc_123',
    geometry: { type: 'Point', coordinates: ['-1.21257', '52.79207'] },
  };

  assert.throws(() => toPublicIncident(incident), /finite numbers/);
  assert.throws(() => toPublicVersion({
    version: 1,
    changedFields: ['status'],
    reason: 'source-update',
    createdAt: capturedAt,
    snapshot: incident,
  }), /finite numbers/);
});

test('source observations preserve own __proto__ payload data while hashing deterministically', () => {
  const rawPayload = JSON.parse('{"__proto__":{"severityLevel":3},"description":"Lower River Soar"}');
  const observation = createSourceObservation({ ...observationInput, rawPayload }, { capturedAt });

  assert.equal(Object.hasOwn(observation.rawPayload, '__proto__'), true);
  assert.deepEqual(observation.rawPayload.__proto__, { severityLevel: 3 });
  assert.equal(observation.payloadHash, createSourceObservation({ ...observationInput, rawPayload }, { capturedAt }).payloadHash);
});

test('geometry normalises provider strings and computes distance to an area', () => {
  const polygon = normalizeGeoJsonGeometry({
    type: 'Polygon',
    coordinates: [[
      '-1.22 52.78',
      '-1.20 52.78',
      '-1.20 52.80',
      '-1.22 52.80',
      '-1.22 52.78',
    ]],
  });
  assert.deepEqual(polygon.coordinates[0][0], [-1.22, 52.78]);
  assert.deepEqual(centroidForGeometry(polygon), {
    latitude: 52.79,
    longitude: -1.21,
  });
  assert.equal(distanceToGeometryMetres(
    { latitude: 52.79, longitude: -1.21 },
    polygon,
  ), 0);
  assert.ok(distanceToGeometryMetres(
    { latitude: 52.82, longitude: -1.21 },
    polygon,
  ) > 1000);
});

test('geometry supports points and lines without mutating provider fixtures', () => {
  const fixture = { type: 'LineString', coordinates: ['-1.22 52.78', [-1.2, 52.8]] };
  const line = normalizeGeoJsonGeometry(fixture);
  assert.deepEqual(line, { type: 'LineString', coordinates: [[-1.22, 52.78], [-1.2, 52.8]] });
  assert.deepEqual(fixture, { type: 'LineString', coordinates: ['-1.22 52.78', [-1.2, 52.8]] });
  assert.ok(distanceToGeometryMetres({ latitude: 52.79, longitude: -1.21 }, line) < 10);

  const point = normalizeGeoJsonGeometry({ type: 'Point', coordinates: '-1.21 52.79' });
  assert.deepEqual(centroidForGeometry(point), { latitude: 52.79, longitude: -1.21 });
  assert.equal(distanceToGeometryMetres({ latitude: 52.79, longitude: -1.21 }, point), 0);
});

test('geometry preserves official multipolygon areas and measures the nearest component', () => {
  const multipolygon = normalizeGeoJsonGeometry({
    type: 'MultiPolygon',
    coordinates: [
      [[[-1.22, 52.78], [-1.2, 52.78], [-1.2, 52.8], [-1.22, 52.8], [-1.22, 52.78]]],
      [[[-0.02, 51.47], [0, 51.47], [0, 51.49], [-0.02, 51.49], [-0.02, 51.47]]],
    ],
  });
  assert.equal(multipolygon.type, 'MultiPolygon');
  assert.equal(multipolygon.coordinates.length, 2);
  assert.equal(distanceToGeometryMetres({ latitude: 51.48, longitude: -0.01 }, multipolygon), 0);
  assert.ok(distanceToGeometryMetres({ latitude: 51.48, longitude: -0.04 }, multipolygon) > 1000);
  assert.ok(centroidForGeometry(multipolygon).latitude > 51 && centroidForGeometry(multipolygon).latitude < 53);
});

test('geometry rejects invalid bounds, open polygons, unsupported types, and oversized input', () => {
  assert.throws(
    () => normalizeGeoJsonGeometry({ type: 'Point', coordinates: [181, 52] }),
    /longitude/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({ type: 'Point', coordinates: [0, -91] }),
    /latitude/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({ type: 'Point', coordinates: [Number.NaN, 52] }),
    /finite/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({ type: 'Point', coordinates: ['-1.21', 52.79] }),
    /finite numbers/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({ type: 'Point', coordinates: [null, true] }),
    /finite numbers/,
  );
  assert.throws(
    () => distanceToGeometryMetres(
      { latitude: '52.79', longitude: -1.21 },
      { type: 'Point', coordinates: [-1.21, 52.79] },
    ),
    /finite numbers/,
  );
  assert.throws(
    () => normalizeIncidentDraft({
      ...incidentInput,
      centroid: { latitude: null, longitude: '-1.21257' },
    }),
    /centroid latitude/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
    }),
    /closed/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({ type: 'MultiPoint', coordinates: [[0, 0]] }),
    /Unsupported geometry type/,
  );
  assert.throws(
    () => normalizeGeoJsonGeometry({
      type: 'LineString',
      coordinates: Array.from({ length: 20_001 }, (_, index) => [index / 1_000_000, 0]),
    }),
    /20,000/,
  );
});
