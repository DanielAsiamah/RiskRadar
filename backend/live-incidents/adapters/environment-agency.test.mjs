import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createEnvironmentAgencyAdapter } from './environment-agency.mjs';
import { LIVE_SOURCE_DEFINITIONS, createInitialSourceStates } from '../sources.mjs';

const fixture = async (name) => JSON.parse(await readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
const now = () => new Date('2026-08-27T18:00:00.000Z');

function responseFor(payload, headers = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json', 'last-modified': 'Thu, 27 Aug 2026 17:45:00 GMT', ...headers },
  });
}

test('source catalogue declares only the Environment Agency as a configured free live feed', () => {
  const environmentAgency = LIVE_SOURCE_DEFINITIONS.find((source) => source.id === 'environment-agency-floods-england');
  assert.equal(environmentAgency.defaultState, 'enabled');
  assert.equal(environmentAgency.pollIntervalMs, 15 * 60 * 1000);
  assert.deepEqual(environmentAgency.coverage.countries, ['England']);
  assert.equal(LIVE_SOURCE_DEFINITIONS.find((source) => source.id === 'tfl-disruptions-london').defaultState, 'not-configured');
  assert.equal(LIVE_SOURCE_DEFINITIONS.find((source) => source.id === 'national-highways-england').defaultState, 'disabled');
  const states = createInitialSourceStates({}, now);
  assert.match(states.find((state) => state.sourceId === 'flood-wales').disclosure, /not yet connected/);
});

test('normalises one official England flood alert with its area polygon', async () => {
  const floods = await fixture('environment-agency-floods.json');
  const area = await fixture('environment-agency-area.json');
  const polygon = await fixture('environment-agency-polygon.json');
  const responses = new Map([
    ['/flood-monitoring/id/floods', floods],
    ['/flood-monitoring/id/floodAreas/034WAF428', area],
    ['/flood-monitoring/id/floodAreas/034WAF428/polygon', polygon],
  ]);
  const adapter = createEnvironmentAgencyAdapter({
    fetchImpl: async (input) => responseFor(responses.get(new URL(input).pathname)),
    now,
    sleep: async () => {},
    random: () => 0,
  });
  const result = await adapter.fetchChanges({ cursor: null, runId: 'run-ea-001' });
  assert.equal(result.status, 'success');
  assert.equal(result.records.length, 1);
  const record = result.records[0];
  assert.equal(record.incidentDraft.category, 'flood');
  assert.equal(record.incidentDraft.severity, 2);
  assert.equal(record.incidentDraft.locationPrecision, 'exact-area');
  assert.equal(record.incidentDraft.geometry.type, 'Polygon');
  assert.equal(record.observationInput.sourceUrl.startsWith('https://'), true);
  assert.equal(record.observationInput.sourcePublishedAt, '2026-08-27T16:09:22.000Z');
  assert.equal(record.observationInput.rawPayload.warning.floodAreaID, '034WAF428');
});

test('uses validators from its cursor and treats 304 as a non-reconciling success', async () => {
  let request;
  const adapter = createEnvironmentAgencyAdapter({
    fetchImpl: async (input, init) => {
      request = { input, init };
      return new Response(null, { status: 304, headers: { etag: '"latest"' } });
    },
    now,
  });
  const result = await adapter.fetchChanges({
    cursor: { etag: '"old"', lastModified: 'Thu, 27 Aug 2026 17:00:00 GMT' },
    runId: 'run-ea-304',
  });
  assert.equal(request.init.headers['if-none-match'], '"old"');
  assert.equal(request.init.headers['if-modified-since'], 'Thu, 27 Aug 2026 17:00:00 GMT');
  assert.deepEqual(result, {
    status: 'not-modified', fullSnapshot: false, records: [], cursor: { etag: '"latest"', lastModified: null },
    sourceWatermark: null, httpStatus: 304, latencyMs: 0, counts: { fetched: 0, accepted: 0, rejected: 0 },
  });
});

test('maps severity 1 to 5, severity 2 to 4, and severity 4 to resolving', async () => {
  const floods = await fixture('environment-agency-floods.json');
  const area = await fixture('environment-agency-area.json');
  const polygon = await fixture('environment-agency-polygon.json');
  const adapter = createEnvironmentAgencyAdapter({
    fetchImpl: async (input) => {
      const pathname = new URL(input).pathname;
      if (pathname === '/flood-monitoring/id/floods') return responseFor({ items: [
        { ...floods.items[0], floodAreaID: 'one', severityLevel: 1, floodArea: { ...floods.items[0].floodArea, '@id': 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas/one', polygon: 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas/one/polygon' } },
        { ...floods.items[0], floodAreaID: 'two', severityLevel: 2, floodArea: { ...floods.items[0].floodArea, '@id': 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas/two', polygon: 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas/two/polygon' } },
        { ...floods.items[0], floodAreaID: 'four', severityLevel: 4, floodArea: { ...floods.items[0].floodArea, '@id': 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas/four', polygon: 'https://environment.data.gov.uk/flood-monitoring/id/floodAreas/four/polygon' } },
      ] });
      if (pathname.endsWith('/polygon')) return responseFor(polygon);
      return responseFor({ items: { ...area.items, polygon: `https://environment.data.gov.uk${pathname}/polygon` } });
    },
    now,
    sleep: async () => {},
    random: () => 0,
  });
  const result = await adapter.fetchChanges({ cursor: null, runId: 'run-ea-levels' });
  assert.deepEqual(result.records.map((record) => [record.incidentDraft.severity, record.incidentDraft.status]), [[5, 'active'], [4, 'active'], [1, 'resolving']]);
});
