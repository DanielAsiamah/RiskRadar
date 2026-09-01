import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LIVE_RISK_POLICY_VERSION,
  calculateLiveRisk,
  calculateRouteLiveRisk,
} from './risk-overlay.mjs';

const calculatedAt = '2026-08-27T18:00:00.000Z';
const officialFlood = {
  id: 'inc_flood_1',
  category: 'flood',
  severity: 4,
  confidence: 0.98,
  verificationLevel: 'Official',
  publicationState: 'published',
  status: 'active',
  geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] },
  affectedRadiusMetres: 2_000,
  lastObservedAt: '2026-08-27T17:45:00.000Z',
  sourceUpdatedAt: '2026-08-27T17:45:00.000Z',
  expiresAt: '2026-08-27T19:00:00.000Z',
  riskConstraints: {
    maxScoreDelta: null,
    canTriggerMajorAlert: true,
    canTriggerRouteAvoidance: true,
  },
};

const point = { latitude: 52.79207, longitude: -1.21257 };

test('official nearby incidents layer over context without rewriting baseline', () => {
  const result = calculateLiveRisk({
    baselineScore: 34,
    contextScore: 36,
    contextAdjustments: [{ id: 'night', label: 'Late-night pressure', points: 2 }],
    incidents: [officialFlood],
    point,
    calculatedAt,
  });

  assert.equal(result.baselineScore, 34);
  assert.equal(result.contextScore, 36);
  assert.ok(result.liveScore > 36);
  assert.equal(result.liveDelta, result.liveScore - 36);
  assert.deepEqual(result.contributors.map((item) => item.incidentId), ['inc_flood_1']);
  assert.equal(result.policyVersion, LIVE_RISK_POLICY_VERSION);
  assert.equal(result.calculatedAt, calculatedAt);
  assert.deepEqual(result.contextAdjustments, [{ id: 'night', label: 'Late-night pressure', points: 2 }]);
});

test('resolved and out-of-radius incidents contribute zero', () => {
  for (const incident of [
    { ...officialFlood, status: 'resolved' },
    { ...officialFlood, geometry: { type: 'Point', coordinates: [-4, 57] } },
  ]) {
    const result = calculateLiveRisk({
      baselineScore: 34,
      contextScore: 36,
      contextAdjustments: [],
      incidents: [incident],
      point,
      calculatedAt,
    });
    assert.equal(result.liveScore, 36);
    assert.equal(result.liveDelta, 0);
    assert.deepEqual(result.contributors, []);
  }
});

test('unverified and preliminary evidence obey score caps', () => {
  const unverified = calculateLiveRisk({
    baselineScore: 30,
    contextScore: 30,
    contextAdjustments: [],
    incidents: [{
      ...officialFlood,
      id: 'inc_unverified',
      severity: 5,
      confidence: 1,
      verificationLevel: 'Unverified',
      riskConstraints: {
        maxScoreDelta: 10,
        canTriggerMajorAlert: false,
        canTriggerRouteAvoidance: false,
      },
    }],
    point,
    calculatedAt,
  });
  assert.ok(unverified.liveDelta <= 10);
  assert.notEqual(unverified.riskLevel, 'high');

  const preliminary = calculateLiveRisk({
    baselineScore: 30,
    contextScore: 30,
    contextAdjustments: [],
    incidents: [{
      ...officialFlood,
      id: 'inc_preliminary',
      severity: 5,
      confidence: 1,
      verificationLevel: 'Preliminary',
      publicationState: 'preliminary',
      riskConstraints: {
        maxScoreDelta: 20,
        canTriggerMajorAlert: false,
        canTriggerRouteAvoidance: false,
      },
    }],
    point,
    calculatedAt,
  });
  assert.ok(preliminary.liveDelta <= 20);
});

test('route output reports maximum and exposure-weighted live risk', () => {
  const route = calculateRouteLiveRisk({
    samples: [
      { id: 'sample-1', ...point, baselineScore: 34, contextScore: 36, contextAdjustments: [] },
      { id: 'sample-2', latitude: 52.9, longitude: -1.3, baselineScore: 20, contextScore: 20, contextAdjustments: [] },
    ],
    incidents: [officialFlood],
    calculatedAt,
  });

  assert.equal(route.samples.length, 2);
  assert.equal(route.maximumLiveScore, Math.max(...route.samples.map((item) => item.liveScore)));
  assert.ok(route.exposureWeightedLiveScore >= 0);
  assert.ok(route.exposureWeightedLiveScore <= 100);
  assert.deepEqual(route.contributingIncidentIds, ['inc_flood_1']);
  assert.equal(route.policyVersion, LIVE_RISK_POLICY_VERSION);
});

test('risk calculations validate scores and handle a maximum context score', () => {
  assert.throws(() => calculateLiveRisk({
    baselineScore: -1,
    contextScore: 10,
    contextAdjustments: [],
    incidents: [],
    point,
    calculatedAt,
  }), /baselineScore/);

  const result = calculateLiveRisk({
    baselineScore: 100,
    contextScore: 100,
    contextAdjustments: [],
    incidents: [officialFlood],
    point,
    calculatedAt,
  });
  assert.equal(result.liveScore, 100);
  assert.equal(result.liveDelta, 0);
  assert.throws(() => calculateRouteLiveRisk({ samples: [], incidents: [], calculatedAt }), /samples/);
});
