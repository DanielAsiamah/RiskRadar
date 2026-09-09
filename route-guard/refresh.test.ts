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
};
test('refresh replaces risk and hotzones while preserving road context', () => {
  const updated = applyRouteLiveRefresh(samples, response);
  assert.equal(updated.sampledRiskScores[0].score, 82);
  assert.equal(updated.sampledRiskScores[0].riskLevel, 'red');
  assert.equal(updated.sampledRiskScores[0].contextLabel, 'High Street');
  assert.match(updated.sampledRiskScores[0].basis, /Flood warning nearby/);
  assert.equal(updated.hotzoneSections.length, 1);
  assert.equal(updated.overallRiskScore, 82);
  assert.equal(samples[0].score, 20);
});
test('cleared incidents reduce scores without compounding previous live contributions', () => {
  const raised = applyRouteLiveRefresh(samples, response);
  const cooled = applyRouteLiveRefresh(raised.sampledRiskScores, {
    ...response, live: { ...response.live, samples: [{ liveScore: 20, contextScore: 20, contributors: [] }] },
  });
  assert.equal(cooled.overallRiskScore, 20);
  assert.equal(cooled.hotzoneSections.length, 0);
  assert.doesNotMatch(cooled.sampledRiskScores[0].basis, /Flood warning/);
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
