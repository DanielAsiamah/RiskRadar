import assert from 'node:assert/strict';
import test from 'node:test';
import { applyRouteLiveRefresh, startRouteRiskPolling, type RouteLiveRefresh } from './refresh.ts';
import type { RouteGuardRiskSample } from '../api/route-guard.ts';

const samples: RouteGuardRiskSample[] = [
  { pointIndex: 3, latitude: 51, longitude: -1, score: 20, riskLevel: 'low', basis: 'Old', contextLabel: 'High Street' },
];
const response: RouteLiveRefresh = {
  mode: 'route', samples: [{ id: '3', latitude: 51, longitude: -1 }],
  live: { calculatedAt: '2026-09-08T12:00:00Z', samples: [{ liveScore: 82, contextScore: 20, contributors: [{ incidentId: 'flood-1', reason: 'Flood warning nearby' }] }] },
  incidents: [{
    id: 'flood-1', provider: 'environment-agency', category: 'flood', title: 'Flood warning',
    summary: 'Flooding affects the route.', severity: 4, verificationLevel: 'Official',
    centroid: { latitude: 51, longitude: -1 }, affectedRadiusMetres: 500,
    locationLabel: 'High Street', locationPrecision: 'road-segment',
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/example',
    sourceUpdatedAt: '2026-09-08T11:55:00Z',
  }, {
    id: 'not-a-contributor', provider: 'transport-for-london', category: 'road-closure', title: 'Unrelated closure',
    summary: 'This incident did not affect a sampled route point.', severity: 3, verificationLevel: 'Official',
    centroid: { latitude: 52, longitude: -1 }, affectedRadiusMetres: 100,
    locationLabel: 'Another road', locationPrecision: 'road-segment',
    sourceUrl: 'https://tfl.gov.uk/traffic/status/', sourceUpdatedAt: '2026-09-08T11:54:00Z',
  }],
};
test('refresh replaces risk and hotzones while preserving road context', () => {
  const updated = applyRouteLiveRefresh(samples, response);
  assert.equal(updated.sampledRiskScores[0].score, 82);
  assert.equal(updated.sampledRiskScores[0].riskLevel, 'red');
  assert.equal(updated.sampledRiskScores[0].contextLabel, 'High Street');
  assert.match(updated.sampledRiskScores[0].basis, /Flood warning nearby/);
  assert.equal(updated.hotzoneSections.length, 1);
  assert.equal(updated.overallRiskScore, 82);
  assert.deepEqual(updated.liveIncidentMarkers.map((marker) => marker.id), ['flood-1']);
  assert.equal(updated.liveIncidentMarkers[0].color, '#dc2626');
  assert.equal(samples[0].score, 20);
});
test('cleared incidents reduce scores without compounding previous live contributions', () => {
  const raised = applyRouteLiveRefresh(samples, response);
  const cooled = applyRouteLiveRefresh(raised.sampledRiskScores, {
    ...response, live: { ...response.live, samples: [{ liveScore: 20, contextScore: 20, contributors: [] }] },
  });
  assert.equal(cooled.overallRiskScore, 20);
  assert.equal(cooled.hotzoneSections.length, 0);
  assert.deepEqual(cooled.liveIncidentMarkers, []);
  assert.doesNotMatch(cooled.sampledRiskScores[0].basis, /Flood warning/);
});

test('missing source health never becomes a successful empty live check', () => {
  const updated = applyRouteLiveRefresh(samples, {
    ...response, live: { ...response.live, samples: [{ liveScore: 20, contextScore: 20, contributors: [] }] },
  });
  assert.match(updated.sampledRiskScores[0].basis, /source.*unavailable/i);
  assert.doesNotMatch(updated.sampledRiskScores[0].basis, /No contributing active incidents/);
  assert.equal(updated.overallRiskScore, 20);
});

test('source outage metadata travels with known incident warnings rather than clearing them', () => {
  const liveData = { checkedAt: response.live.calculatedAt, scope: 'source-network' as const, status: 'unavailable' as const, sources: [] };
  const updated = applyRouteLiveRefresh(samples, { ...response, liveData });
  assert.deepEqual(updated.liveData, liveData);
  assert.equal(updated.overallRiskScore, 82);
  assert.deepEqual(updated.liveIncidentMarkers.map((marker) => marker.id), ['flood-1']);
  assert.match(updated.sampledRiskScores[0].basis, /Flood warning nearby/);
  assert.match(updated.sampledRiskScores[0].basis, /sources unavailable/);
});

test('partial refresh clears stale scores but keeps available hotzones and incident markers', () => {
  const originals: RouteGuardRiskSample[] = [
    { ...samples[0], score: 90, riskLevel: 'red' },
    { ...samples[0], pointIndex: 7, latitude: 51.001, contextLabel: 'Station Road' },
  ];
  const partial: RouteLiveRefresh = {
    ...response,
    samples: [response.samples[0], { id: '7', latitude: 51.001, longitude: -1 }],
    live: { ...response.live, samples: [
      { dataAvailable: false, liveScore: null, contextScore: null, contributors: response.live.samples[0].contributors },
      { liveScore: 82, contextScore: 20, contributors: [] },
    ] },
  };
  const result = applyRouteLiveRefresh(originals, partial);
  assert.equal(result.sampledRiskScores[0].score, null);
  assert.equal(result.sampledRiskScores[0].riskLevel, 'unknown');
  assert.match(result.sampledRiskScores[0].basis, /unavailable/);
  assert.doesNotMatch(result.sampledRiskScores[0].basis, /null\/100|0\/100/);
  assert.equal(result.sampledRiskScores[1].score, 82);
  assert.deepEqual(result.hotzoneSections.map((zone) => zone.startPointIndex), [7]);
  assert.equal(result.overallRiskScore, null);
  assert.equal(result.overallRiskLevel, 'unknown');
  assert.deepEqual(result.liveIncidentMarkers.map((marker) => marker.id), ['flood-1']);
  const recovered = applyRouteLiveRefresh(result.sampledRiskScores, {
    ...partial, live: { ...partial.live, samples: [
      { dataAvailable: true, liveScore: 20, contextScore: 20, contributors: [] },
      { dataAvailable: true, liveScore: 20, contextScore: 20, contributors: [] },
    ] },
  });
  assert.equal(recovered.overallRiskScore, 20);
  assert.equal(recovered.overallRiskLevel, 'low');
  assert.deepEqual(recovered.liveIncidentMarkers, []);
});

test('all unavailable samples produce unknown risk, not a zero score or a refresh exception', () => {
  const result = applyRouteLiveRefresh(samples, {
    ...response, live: { ...response.live, samples: [{ dataAvailable: false, liveScore: null, contextScore: null, contributors: [] }] },
  });
  assert.equal(result.overallRiskScore, null);
  assert.equal(result.overallRiskLevel, 'unknown');
  assert.deepEqual(result.hotzoneSections, []);
});

test('unavailable flags never legitimise numeric guesses or malformed readings', () => {
  for (const reading of [
    { dataAvailable: false, liveScore: 30, contextScore: 20, contributors: [] },
    { dataAvailable: true, liveScore: null, contextScore: null, contributors: [] },
    { liveScore: null, contextScore: null, contributors: [] },
    { dataAvailable: false, liveScore: null, contextScore: 20, contributors: [] },
  ]) assert.throws(() => applyRouteLiveRefresh(samples, { ...response, live: { ...response.live, samples: [reading] } }));
});
test('rejects incomplete, mismatched and malformed refresh responses', () => {
  for (const changed of [
    { ...response, samples: [] },
    { ...response, samples: [{ id: 'wrong', latitude: 51, longitude: -1 }] },
    { ...response, samples: [{ id: '3', latitude: 52, longitude: -1 }] },
    { ...response, live: { ...response.live, samples: [] } },
    { ...response, live: { ...response.live, calculatedAt: 'bad' } },
    { ...response, live: { ...response.live, samples: [{ liveScore: 101, contextScore: 20, contributors: [] }] } },
  ]) assert.throws(() => applyRouteLiveRefresh(samples, changed));
});

test('stopping a journey aborts the refresh and ignores its late response', async () => {
  let finish!: (value: RouteLiveRefresh) => void;
  let signal!: AbortSignal;
  let updates = 0;
  const stop = startRouteRiskPolling({
    request: (received) => { signal = received; return new Promise((resolve) => { finish = resolve; }); },
    onValue: () => { updates += 1; }, onError: () => { updates += 1; },
  });
  stop();
  finish(response);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(signal.aborted, true);
  assert.equal(updates, 0);
});

test('a failed refresh retries and recovers without overlapping requests', async () => {
  let attempts = 0;
  let errors = 0;
  let updates = 0;
  let next!: () => void;
  const stop = startRouteRiskPolling({
    request: async () => { attempts += 1; if (attempts === 1) throw new Error('offline'); return response; },
    onError: () => { errors += 1; }, onValue: () => { updates += 1; },
    schedule: (callback) => { next = callback; return () => {}; },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(errors, 1);
  assert.equal(attempts, 1);
  next();
  await new Promise((resolve) => setImmediate(resolve));
  stop();
  assert.equal(attempts, 2);
  assert.equal(updates, 1);
});
