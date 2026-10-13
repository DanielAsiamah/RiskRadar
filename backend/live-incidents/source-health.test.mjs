import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveDataStatus } from './source-health.mjs';
import { createLiveSourceDefinitions } from './sources.mjs';

const definitions = createLiveSourceDefinitions();
const checkedAt = '2026-10-13T12:00:00.000Z';
const state = (patch = {}) => ({
  sourceId: definitions[0].id, state: 'healthy', lastSuccessAt: '2026-10-13T11:50:00.000Z', ...patch,
});

test('one fresh England flood source means limited coverage, not UK-wide or all-hazard coverage', () => {
  const result = createLiveDataStatus(definitions, [state()], checkedAt);
  assert.equal(result.status, 'limited');
  assert.equal(result.scope, 'source-network');
  assert.deepEqual(result.sources[0].coverage, { countries: ['England'], regions: [], kind: 'flood' });
  assert.equal(result.sources[0].state, 'healthy');
  assert.equal(result.sources[1].state, 'not-configured');
  assert.equal(result.sources[2].state, 'disabled');
});

test('source freshness expires at the threshold without waiting for another ingestion attempt', () => {
  for (const lastSuccessAt of ['2026-10-13T11:15:00.000Z', '2026-10-13T12:01:00.000Z', null, 'invalid']) {
    const input = state({ lastSuccessAt });
    const result = createLiveDataStatus(definitions, [input], checkedAt);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.sources[0].state, 'stale');
    assert.equal(input.state, 'healthy');
  }
});

test('failed, never-polled and disconnected feeds do not imply a successful empty check', () => {
  for (const states of [[], [state({ state: 'failed' })], [state({ state: 'enabled' })]]) {
    assert.equal(createLiveDataStatus(definitions, states, checkedAt).status, 'unavailable');
  }
  const spoofed = createLiveDataStatus(definitions, [state({ sourceId: definitions[1].id })], checkedAt);
  assert.equal(spoofed.sources[1].state, 'not-configured');
});

test('public source metadata excludes private operational fields', () => {
  const result = createLiveDataStatus(definitions, [state({ secret: 'private', rawPayload: { private: true } })], checkedAt);
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(result.checkedAt, checkedAt);
});
