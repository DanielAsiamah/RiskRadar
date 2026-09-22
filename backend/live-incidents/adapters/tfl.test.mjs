import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createTflAdapter } from './tfl.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const now = () => new Date('2026-09-22T10:00:00.000Z');

function jsonResponse(payload, options = {}) {
  return new Response(JSON.stringify(payload), {
    status: options.status ?? 200,
    headers: { 'content-type': 'application/json', ...options.headers },
  });
}

async function fixtureAdapter(overrides = {}) {
  const roads = await fixture('tfl-road-disruptions.json');
  const lines = await fixture('tfl-line-disruptions.json');
  return createTflAdapter({
    appKey: 'server-secret-key',
    now,
    sleep: async () => {},
    random: () => 0,
    fetchImpl: async (input) => {
      const pathname = new URL(input).pathname;
      if (pathname === '/Road/all/Disruption') return jsonResponse(roads);
      if (pathname.startsWith('/Line/Mode/')) return jsonResponse(lines);
      throw new Error(`Unexpected TfL path: ${pathname}`);
    },
    ...overrides,
  });
}

test('normalises active TfL road and line disruptions and rejects unusable records independently', async () => {
  const adapter = await fixtureAdapter();
  const result = await adapter.fetchChanges({ runId: 'run-tfl-001' });

  assert.equal(result.status, 'success');
  assert.equal(result.fullSnapshot, true);
  assert.deepEqual(result.counts, { fetched: 6, accepted: 2, rejected: 4 });
  assert.equal(result.records.length, 2);

  const road = result.records.find((record) => record.incidentDraft.externalId === 'TIMS-20260922-001');
  assert.equal(road.incidentDraft.category, 'road-collision');
  assert.equal(road.incidentDraft.severity, 5);
  assert.equal(road.incidentDraft.locationPrecision, 'road-segment');
  assert.deepEqual(road.incidentDraft.geometry, { type: 'Point', coordinates: [-0.1276, 51.5072] });
  assert.equal(road.incidentDraft.locationLabel, 'A4 near Hyde Park Corner (Westminster)');
  assert.equal(road.observationInput.sourceUrl, 'https://tfl.gov.uk/traffic/status/');
  assert.equal(road.observationInput.sourceUpdatedAt, '2026-09-22T09:42:00.000Z');
  assert.equal(JSON.stringify(road).includes('server-secret-key'), false);

  const line = result.records.find((record) => record.incidentDraft.category === 'transport-disruption');
  assert.equal(line.incidentDraft.severity, 4);
  assert.equal(line.incidentDraft.geometry.type, 'LineString');
  assert.deepEqual(line.incidentDraft.geometry.coordinates, [[-0.059406, 51.519587], [-0.17609, 51.516031]]);
  assert.equal(line.incidentDraft.locationLabel, 'Whitechapel Rail Station to London Paddington Rail Station');
  assert.match(line.incidentDraft.externalId, /^line_[a-f0-9]{24}$/);
  assert.equal(line.observationInput.sourceUrl, 'https://tfl.gov.uk/tube-dlr-overground/status/');
});

test('sends the key only to the official API hostname and produces key-free evidence', async () => {
  const requests = [];
  const adapter = createTflAdapter({
    appKey: 'private value / with symbols',
    now,
    fetchImpl: async (input, init) => {
      requests.push({ input: String(input), init });
      return jsonResponse([]);
    },
  });
  await adapter.fetchChanges({ runId: 'run-tfl-key' });

  assert.equal(requests.length, 2);
  for (const request of requests) {
    const url = new URL(request.input);
    assert.equal(url.protocol, 'https:');
    assert.equal(url.hostname, 'api.tfl.gov.uk');
    assert.equal(url.searchParams.get('app_key'), 'private value / with symbols');
    assert.equal(request.init.redirect, 'manual');
  }
});

test('rejects redirects away from api.tfl.gov.uk without forwarding the key', async () => {
  const requestedHosts = [];
  const adapter = createTflAdapter({
    appKey: 'server-secret-key',
    now,
    fetchImpl: async (input) => {
      requestedHosts.push(new URL(input).hostname);
      return new Response(null, { status: 302, headers: { location: 'https://attacker.example/collect' } });
    },
  });
  await assert.rejects(() => adapter.fetchChanges({ runId: 'run-tfl-redirect' }), /api\.tfl\.gov\.uk/);
  assert.deepEqual(requestedHosts, ['api.tfl.gov.uk', 'api.tfl.gov.uk']);
  assert.equal(requestedHosts.includes('attacker.example'), false);
});

test('retries one transient provider failure and then succeeds', async () => {
  let calls = 0;
  const adapter = createTflAdapter({
    appKey: 'server-secret-key',
    now,
    sleep: async () => {},
    random: () => 0,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return new Response('busy', { status: 503 });
      return jsonResponse([]);
    },
  });
  const result = await adapter.fetchChanges({ runId: 'run-tfl-retry' });
  assert.equal(result.status, 'success');
  assert.equal(calls, 3);
});

test('rejects oversized and non-array provider payloads', async (t) => {
  await t.test('content length over the bound', async () => {
    const adapter = createTflAdapter({
      appKey: 'server-secret-key', now,
      fetchImpl: async () => new Response('[]', { status: 200, headers: { 'content-length': String(4 * 1024 * 1024 + 1) } }),
    });
    await assert.rejects(() => adapter.fetchChanges({ runId: 'run-tfl-large' }), /size limit/);
  });

  await t.test('wrong top-level schema', async () => {
    const adapter = createTflAdapter({
      appKey: 'server-secret-key', now,
      fetchImpl: async () => jsonResponse({ disruptions: [] }),
    });
    await assert.rejects(() => adapter.fetchChanges({ runId: 'run-tfl-schema' }), /must be an array/);
  });
});

test('requires a non-empty server-side key and run identifier', async () => {
  assert.throws(() => createTflAdapter({ appKey: '   ' }), /appKey/);
  const adapter = await fixtureAdapter();
  await assert.rejects(() => adapter.fetchChanges({ runId: '' }), /runId/);
});
