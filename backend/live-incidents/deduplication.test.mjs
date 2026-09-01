import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MATCH_WINDOWS,
  buildIncidentFingerprint,
  findIncidentMatch,
  haversineDistanceMetres,
} from './deduplication.mjs';

const draft = {
  provider: 'environment-agency',
  externalId: '034WAF428',
  category: 'flood',
  title: 'Flood alert: Lower River Soar',
  severity: 2,
  centroid: { latitude: 52.79207, longitude: -1.21257 },
  sourceOccurredAt: '2026-08-27T16:09:22.000Z',
};

test('same stable provider ID is an exact match', () => {
  const result = findIncidentMatch(draft, [{
    id: 'inc_existing',
    category: 'flood',
    title: 'Lower River Soar flood alert',
    severity: 2,
    centroid: { latitude: 52.792, longitude: -1.2125 },
    sourceOccurredAt: '2026-08-27T16:00:00.000Z',
    sourceKeys: ['environment-agency:034WAF428'],
  }]);
  assert.deepEqual(result, {
    kind: 'exact',
    incidentId: 'inc_existing',
    candidateIds: ['inc_existing'],
    distanceMetres: 0,
    reasonCodes: ['same-provider-external-id'],
  });
});

test('fingerprint ignores harmless title case and spacing', () => {
  assert.equal(
    buildIncidentFingerprint(draft),
    buildIncidentFingerprint({ ...draft, title: '  FLOOD ALERT: lower river soar  ' }),
  );
});

test('nearby compatible incidents with shared place words return one candidate', () => {
  const result = findIncidentMatch(draft, [{
    id: 'inc_nearby',
    category: 'flood',
    title: 'Lower River Soar flooding alert',
    severity: 2,
    centroid: { latitude: 52.794, longitude: -1.213 },
    sourceOccurredAt: '2026-08-27T17:00:00.000Z',
    sourceKeys: [],
  }]);
  assert.equal(result.kind, 'candidate');
  assert.equal(result.incidentId, 'inc_nearby');
  assert.deepEqual(result.candidateIds, ['inc_nearby']);
  assert.ok(result.distanceMetres > 0);
  assert.deepEqual(result.reasonCodes, ['same-category', 'within-time-window', 'within-distance-window', 'title-overlap']);
});

test('distant or time-incompatible incidents never merge', () => {
  for (const candidate of [
    {
      id: 'inc_distant', category: 'flood', title: 'Lower River Soar flood alert', severity: 2,
      centroid: { latitude: 53.2, longitude: -1.2 }, sourceOccurredAt: '2026-08-27T16:00:00.000Z', sourceKeys: [],
    },
    {
      id: 'inc_old', category: 'flood', title: 'Lower River Soar flood alert', severity: 2,
      centroid: { latitude: 52.792, longitude: -1.212 }, sourceOccurredAt: '2026-08-24T16:00:00.000Z', sourceKeys: [],
    },
  ]) {
    assert.deepEqual(findIncidentMatch(draft, [candidate]), {
      kind: 'none', incidentId: null, candidateIds: [], distanceMetres: null, reasonCodes: ['no-compatible-candidate'],
    });
  }
});

test('close high-severity candidates remain ambiguous rather than merging destructively', () => {
  const highSeverityDraft = { ...draft, category: 'road-collision', severity: 5, title: 'Serious collision on King Street' };
  const result = findIncidentMatch(highSeverityDraft, [
    {
      id: 'inc_a', category: 'road-collision', title: 'Serious collision King Street', severity: 5,
      centroid: { latitude: 52.7921, longitude: -1.2126 }, sourceOccurredAt: '2026-08-27T16:10:00.000Z', sourceKeys: [],
    },
    {
      id: 'inc_b', category: 'road-collision', title: 'Serious collision at King Street', severity: 4,
      centroid: { latitude: 52.7922, longitude: -1.2127 }, sourceOccurredAt: '2026-08-27T16:11:00.000Z', sourceKeys: [],
    },
  ]);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.incidentId, null);
  assert.deepEqual(result.candidateIds, ['inc_a', 'inc_b']);
  assert.deepEqual(result.reasonCodes, ['multiple-high-severity-candidates']);
});

test('matching exports fixed category windows and accurate distances', () => {
  assert.equal(MATCH_WINDOWS.flood.maxDistanceMetres, 10_000);
  assert.equal(MATCH_WINDOWS['road-collision'].maxTimeMs, 2 * 60 * 60 * 1000);
  assert.ok(haversineDistanceMetres(
    { latitude: 51.5074, longitude: -0.1278 },
    { latitude: 51.5074, longitude: -0.1278 },
  ) < 0.001);
  assert.throws(() => findIncidentMatch(draft, 'not-an-array'), /candidates/);
});
