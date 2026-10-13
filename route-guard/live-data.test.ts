import assert from 'node:assert/strict';
import test from 'node:test';
import { describeRouteLiveData, readRouteLiveData, type RouteLiveData } from './live-data.ts';

const at = Date.parse('2026-10-13T12:00:00Z');
const liveData: RouteLiveData = {
  checkedAt: '2026-10-13T12:00:00Z', scope: 'source-network', status: 'limited',
  sources: [{
    sourceId: 'ea', label: 'Environment Agency flood warnings', state: 'healthy',
    lastSuccessAt: '2026-10-13T11:50:00Z', staleAfterMs: 45 * 60_000,
    coverage: { countries: ['England'], regions: [], kind: 'flood' },
  }],
};

test('fresh source health stays limited to its named geography and hazard', () => {
  const model = describeRouteLiveData(liveData, at);
  assert.equal(model.status, 'limited');
  assert.match(model.sources[0].detail, /England/);
  assert.match(model.sources[0].detail, /flood/);
  assert.match(model.detail, /not.*live crime feed/i);
});

test('source health ages out on screen without a new API response', () => {
  const model = describeRouteLiveData(liveData, at + 35 * 60_000);
  assert.equal(model.status, 'unavailable');
  assert.equal(model.sources[0].stateLabel, 'Stale');
  assert.match(model.detail, /could not be confirmed/i);
});

test('missing, malformed and future source metadata cannot reassure the user', () => {
  for (const value of [undefined, null, {}, { ...liveData, sources: null },
    { ...liveData, checkedAt: 'invalid' }, { ...liveData, checkedAt: '2026-10-14T12:00:00Z' },
    { ...liveData, sources: [{ ...liveData.sources[0], coverage: null }] },
    { ...liveData, sources: [{ ...liveData.sources[0], staleAfterMs: null }] },
  ]) assert.equal(describeRouteLiveData(value, at).status, 'unavailable');
  assert.equal(readRouteLiveData({ ...liveData, sources: null }), undefined);
});

test('an unavailable server snapshot cannot be upgraded by a healthy-looking source entry', () => {
  assert.equal(describeRouteLiveData({ ...liveData, status: 'unavailable' }, at).status, 'unavailable');
});
