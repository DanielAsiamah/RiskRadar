import assert from 'node:assert/strict';
import test from 'node:test';

import { createSourceObservation } from './contracts.mjs';
import { createMemoryLiveIncidentStore } from './memory-store.mjs';

const nowIso = '2026-08-27T18:00:00.000Z';
const sourceDefinition = {
  id: 'environment-agency-floods-england',
  provider: 'environment-agency',
  defaultState: 'enabled',
  staleAfterMs: 45 * 60 * 1000,
};

function createStore() {
  return createMemoryLiveIncidentStore({
    sourceDefinitions: [sourceDefinition],
    now: () => new Date(nowIso),
  });
}

function observation() {
  return createSourceObservation({
    provider: 'environment-agency',
    providerTier: 1,
    externalId: '034WAF428',
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
    sourcePublishedAt: '2026-08-27T16:09:22.000Z',
    sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
    rawPayload: { severityLevel: 3 },
    ingestionRunId: 'run-ea-001',
    validationState: 'valid',
    validationErrors: [],
  }, { capturedAt: nowIso });
}

function incident(overrides = {}) {
  return {
    id: 'inc_flood_1',
    fingerprint: 'flood|lower river soar',
    provider: 'environment-agency',
    category: 'flood',
    subcategory: 'flood-alert',
    title: 'Flood alert: Lower River Soar',
    summary: 'Flooding is possible.',
    status: 'active',
    publicationState: 'published',
    verificationLevel: 'Official',
    confidence: 0.98,
    severity: 2,
    geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] },
    centroid: { latitude: 52.79207, longitude: -1.21257 },
    locationLabel: 'Lower River Soar in Leicestershire',
    locationPrecision: 'exact-area',
    affectedRadiusMetres: 2_000,
    firstObservedAt: nowIso,
    sourceOccurredAt: '2026-08-27T16:09:22.000Z',
    lastObservedAt: nowIso,
    resolvedAt: null,
    expiresAt: '2026-08-27T20:00:00.000Z',
    independentSourceCount: 1,
    currentVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
    sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
    sourceKeys: ['environment-agency:034WAF428'],
    primarySourceObservationId: 'obs_hidden',
    riskConstraints: { maxScoreDelta: null, canTriggerMajorAlert: true, canTriggerRouteAvoidance: true },
    ...overrides,
  };
}

async function createIncident(store, overrides = {}) {
  const sourceObservation = observation();
  await store.insertObservation(sourceObservation);
  return store.applyIncidentMutation({
    observationId: sourceObservation.id,
    sourceKey: 'environment-agency:034WAF428',
    expectedVersion: 0,
    incident: incident(overrides),
    changedFields: ['status', 'severity', 'summary', 'sourceUpdatedAt'],
    reason: 'official-source-created',
    policyVersion: 'live-publication-v1',
    riskPolicyVersion: 'live-risk-v1',
    at: nowIso,
  });
}

test('duplicate observations are inserted once and returned as clones', async () => {
  const store = createStore();
  const sourceObservation = observation();

  assert.equal((await store.insertObservation(sourceObservation)).created, true);
  assert.equal((await store.insertObservation(sourceObservation)).created, false);
  const firstRead = await store.getObservation(sourceObservation.id);
  firstRead.rawPayload.severityLevel = 99;
  assert.equal((await store.getObservation(sourceObservation.id)).rawPayload.severityLevel, 3);
});

test('creating and updating an incident append immutable versions and one outbox event each', async () => {
  const store = createStore();
  const created = await createIncident(store);
  assert.equal(created.created, true);
  assert.equal((await store.listPublicVersions('inc_flood_1')).length, 1);
  assert.equal((await store.listOutboxEvents()).length, 1);

  const updatedIncident = { ...incident(), status: 'updated', severity: 3, currentVersion: 2, updatedAt: '2026-08-27T18:10:00.000Z' };
  await store.applyIncidentMutation({
    observationId: observation().id,
    sourceKey: 'environment-agency:034WAF428',
    expectedVersion: 1,
    incident: updatedIncident,
    changedFields: ['status', 'severity'],
    reason: 'official-source-updated',
    policyVersion: 'live-publication-v1',
    riskPolicyVersion: 'live-risk-v1',
    at: '2026-08-27T18:10:00.000Z',
  });
  const versions = await store.listPublicVersions('inc_flood_1');
  const outbox = await store.listOutboxEvents();
  assert.equal(versions.length, 2);
  assert.equal(outbox.length, 2);
  assert.equal(versions[0].version, 1);
  assert.equal(versions[1].version, 2);
  assert.throws(() => versions[0].snapshot.title = 'changed', TypeError);
  assert.equal((await store.getIncident('inc_flood_1')).severity, 3);
});

test('an unchanged heartbeat touches the incident without a version or outbox event', async () => {
  const store = createStore();
  await createIncident(store);
  const result = await store.touchIncident({
    incidentId: 'inc_flood_1',
    lastObservedAt: '2026-08-27T18:20:00.000Z',
    sourceUpdatedAt: '2026-08-27T18:20:00.000Z',
    at: '2026-08-27T18:20:00.000Z',
  });
  assert.equal(result.touched, true);
  assert.equal((await store.listPublicVersions('inc_flood_1')).length, 1);
  assert.equal((await store.listOutboxEvents()).length, 1);
  assert.equal((await store.getIncident('inc_flood_1')).lastObservedAt, '2026-08-27T18:20:00.000Z');
});

test('a malformed mutation leaves no partial incident, version, or outbox event', async () => {
  const store = createStore();
  await assert.rejects(store.applyIncidentMutation({
    observationId: 'obs_invalid',
    sourceKey: 'environment-agency:bad',
    expectedVersion: 0,
    incident: incident({ id: 'inc_invalid', geometry: { type: 'Point', coordinates: ['bad', 52] }, sourceKeys: ['environment-agency:bad'] }),
    changedFields: ['status'],
    reason: 'test-invalid',
    policyVersion: 'live-publication-v1',
    riskPolicyVersion: 'live-risk-v1',
    at: nowIso,
  }));
  assert.equal(await store.getIncident('inc_invalid'), null);
  assert.deepEqual(await store.listPublicVersions('inc_invalid'), []);
  assert.deepEqual(await store.listOutboxEvents(), []);
});

test('successful full snapshots resolve missing source incidents only', async () => {
  const store = createStore();
  await createIncident(store);
  assert.equal((await store.resolveMissingSourceIncidents({
    sourceId: sourceDefinition.id, fullSnapshot: false, succeeded: true, seenExternalIds: new Set(), at: nowIso,
  })).resolvedCount, 0);
  assert.equal((await store.resolveMissingSourceIncidents({
    sourceId: sourceDefinition.id, fullSnapshot: true, succeeded: false, seenExternalIds: new Set(), at: nowIso,
  })).resolvedCount, 0);
  const result = await store.resolveMissingSourceIncidents({
    sourceId: sourceDefinition.id, fullSnapshot: true, succeeded: true, seenExternalIds: new Set(), at: nowIso,
  });
  assert.equal(result.resolvedCount, 1);
  assert.equal((await store.getIncident('inc_flood_1')).status, 'resolved');
  assert.equal((await store.listPublicVersions('inc_flood_1')).length, 2);
});

test('public radius queries exclude non-public, resolved, expired, and distant incidents', async () => {
  const store = createStore();
  await createIncident(store);
  for (const [id, overrides] of [
    ['inc_review', { id: 'inc_review', publicationState: 'review', sourceKeys: ['environment-agency:review'] }],
    ['inc_resolved', { id: 'inc_resolved', status: 'resolved', sourceKeys: ['environment-agency:resolved'] }],
    ['inc_expired', { id: 'inc_expired', expiresAt: '2026-08-27T17:00:00.000Z', sourceKeys: ['environment-agency:expired'] }],
    ['inc_far', { id: 'inc_far', centroid: { latitude: 57, longitude: -4 }, geometry: { type: 'Point', coordinates: [-4, 57] }, sourceKeys: ['environment-agency:far'] }],
  ]) {
    await store.applyIncidentMutation({
      observationId: `${id}_observation`, sourceKey: overrides.sourceKeys[0], expectedVersion: 0, incident: incident(overrides),
      changedFields: ['status'], reason: 'test-created', policyVersion: 'live-publication-v1', riskPolicyVersion: 'live-risk-v1', at: nowIso,
    });
  }
  const publicIncidents = await store.listPublicIncidents({
    point: { latitude: 52.79207, longitude: -1.21257 }, radiusKm: 2, limit: 10, calculatedAt: nowIso,
  });
  assert.deepEqual(publicIncidents.map((item) => item.id), ['inc_flood_1']);
  assert.ok(publicIncidents[0].distanceMetres < 1);
  assert.equal('sourceKeys' in publicIncidents[0], false);
});

test('source cursors, states, audit records, and the ephemeral disclosure are retained', async () => {
  const store = createStore();
  await store.setSourceCursor(sourceDefinition.id, { etag: '"abc"' });
  await store.setSourceState(sourceDefinition.id, { state: 'healthy', httpStatus: 200, latencyMs: 34 });
  await store.recordAuditEvent({ type: 'source-polled', sourceId: sourceDefinition.id, at: nowIso });
  assert.deepEqual(await store.getSourceCursor(sourceDefinition.id), { etag: '"abc"' });
  assert.equal((await store.getSourceState(sourceDefinition.id)).state, 'healthy');
  assert.equal((await store.listSourceStates()).length, 1);
  assert.equal((await store.listAuditEvents()).length, 1);
  assert.deepEqual(store.describeDurability(), {
    driver: 'memory',
    durability: 'ephemeral',
    persistent: false,
    disclosure: 'Live incident history is stored in memory for local development and is cleared when the backend restarts.',
  });
});
