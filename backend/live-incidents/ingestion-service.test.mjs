import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveIncidentIngestionService } from './ingestion-service.mjs';
import { createMemoryLiveIncidentStore } from './memory-store.mjs';

const nowIso = '2026-08-27T18:00:00.000Z';
const sourceDefinition = {
  id: 'environment-agency-floods-england', provider: 'environment-agency', defaultState: 'enabled',
  staleAfterMs: 45 * 60 * 1000, pollIntervalMs: 15 * 60 * 1000,
};

function record(overrides = {}) {
  const draft = {
    provider: 'environment-agency', externalId: '034WAF428', category: 'flood', subcategory: 'flood-alert',
    title: 'Flood alert: Lower River Soar', summary: 'Flooding is possible.', status: 'active', severity: 2,
    geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] }, centroid: { latitude: 52.79207, longitude: -1.21257 },
    locationLabel: 'Lower River Soar in Leicestershire', locationPrecision: 'exact-area', affectedRadiusMetres: 1_000,
    sourceOccurredAt: '2026-08-27T16:09:22.000Z', expiresAt: '2026-08-27T18:45:00.000Z',
  };
  return {
    observationInput: {
      provider: 'environment-agency', providerTier: 1, externalId: '034WAF428',
      sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
      sourcePublishedAt: '2026-08-27T16:09:22.000Z', sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
      rawPayload: { severityLevel: 3 }, ingestionRunId: 'adapter-run', validationState: 'valid', validationErrors: [],
    },
    incidentDraft: draft,
    ...overrides,
  };
}

function createService(fetchChanges, clock = () => new Date(nowIso)) {
  const store = createMemoryLiveIncidentStore({ sourceDefinitions: [sourceDefinition], now: clock });
  const adapter = { ...sourceDefinition, providerTier: 1, fetchChanges };
  return { store, service: createLiveIncidentIngestionService({ store, adapters: [adapter], now: clock }) };
}

test('first official snapshot creates one versioned public incident and replay is unchanged', async () => {
  let calls = 0;
  const { store, service } = createService(async () => {
    calls += 1;
    return { status: 'success', fullSnapshot: true, records: [record()], cursor: { etag: '"a"' }, sourceWatermark: nowIso, httpStatus: 200, latencyMs: 12, counts: { fetched: 1, accepted: 1, rejected: 0 } };
  });
  const first = await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  assert.equal(first.counts.created, 1);
  assert.equal((await store.listOutboxEvents()).length, 1);
  const second = await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test', force: true });
  assert.equal(second.counts.unchanged, 1);
  assert.equal((await store.listOutboxEvents()).length, 1);
  assert.equal(calls, 2);
});

test('a material source update creates a single updated incident version', async () => {
  const records = [record(), record({
    observationInput: { ...record().observationInput, sourceUpdatedAt: '2026-08-27T16:20:00.000Z', rawPayload: { severityLevel: 2 } },
    incidentDraft: { ...record().incidentDraft, severity: 4, summary: 'Flooding is expected.' },
  })];
  const { store, service } = createService(async () => ({ status: 'success', fullSnapshot: true, records: [records.shift()], cursor: {}, sourceWatermark: nowIso, httpStatus: 200, latencyMs: 1, counts: {} }));
  await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test', force: true });
  const [stored] = await store.listMatchCandidates();
  assert.equal(stored.status, 'updated');
  assert.equal(stored.severity, 4);
  assert.equal((await store.listPublicVersions(stored.id)).length, 2);
});

test('a complete successful snapshot resolves omitted existing provider incidents', async () => {
  const responses = [
    { status: 'success', fullSnapshot: true, records: [record()], cursor: {}, sourceWatermark: nowIso, httpStatus: 200, latencyMs: 1, counts: {} },
    { status: 'success', fullSnapshot: true, records: [], cursor: {}, sourceWatermark: nowIso, httpStatus: 200, latencyMs: 1, counts: {} },
  ];
  const { store, service } = createService(async () => responses.shift());
  await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test', force: true });
  const [stored] = await store.listMatchCandidates();
  assert.equal(stored, undefined);
  assert.equal((await store.listOutboxEvents()).length, 2);
});

test('304 is healthy and a later manual run inside the interval skips without polling', async () => {
  let calls = 0;
  const { store, service } = createService(async () => {
    calls += 1;
    return { status: 'not-modified', fullSnapshot: false, records: [], cursor: { etag: '"b"' }, sourceWatermark: null, httpStatus: 304, latencyMs: 2, counts: {} };
  });
  const first = await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  const second = await service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  assert.equal(first.status, 'not-modified');
  assert.equal(second.status, 'skipped');
  assert.equal(calls, 1);
  assert.equal((await store.getSourceState(sourceDefinition.id)).state, 'healthy');
});

test('overlapping runs share one provider request and failures do not resolve incidents', async () => {
  let resolveFetch;
  let calls = 0;
  const { store, service } = createService(async () => {
    calls += 1;
    return new Promise((resolve) => { resolveFetch = resolve; });
  });
  const first = service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  const second = service.run({ sourceId: sourceDefinition.id, requestedBy: 'test' });
  await new Promise((resolve) => setImmediate(resolve));
  resolveFetch({ status: 'success', fullSnapshot: true, records: [], cursor: {}, sourceWatermark: null, httpStatus: 200, latencyMs: 1, counts: {} });
  assert.equal((await first).status, 'success');
  assert.equal((await second).status, 'success');
  assert.equal(calls, 1);
  assert.equal((await store.getSourceState(sourceDefinition.id)).state, 'healthy');
});
