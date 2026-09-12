import test from 'node:test';
import assert from 'node:assert/strict';
import { processRouteBackgroundUpdate, type RouteBackgroundState } from './background.ts';
import type { RouteGuardScan } from '../api/route-guard.ts';

const now = Date.parse('2026-09-12T12:00:00Z');
function state(): RouteBackgroundState {
  return {
    sessionId: 'journey-1', enabled: true, expiresAt: now + 60_000, lastRefreshAt: now,
    alertedKeys: [], lastLocation: null, lastAlert: null, warning: null,
    route: {
      provider: 'free-osm', routePoints: [
        { index: 0, latitude: 51.5, longitude: -0.1, label: 'Start' },
        { index: 1, latitude: 51.5, longitude: -0.09, label: 'End' },
      ], sampledRiskScores: [{ pointIndex: 0, latitude: 51.5, longitude: -0.092, score: 80, riskLevel: 'red', basis: 'Active disruption', contextLabel: 'High Street' }],
    } as RouteGuardScan,
  };
}
const location = { latitude: 51.5, longitude: -0.095, accuracyMetres: 15, timestamp: now };
function harness(initial = state()) {
  let stored: RouteBackgroundState | null = initial;
  const sent: string[] = [];
  const dependencies = {
    load: async () => stored,
    save: async (next: RouteBackgroundState) => { stored = next; },
    refresh: async () => { throw new Error('Unexpected refresh'); },
    notify: async (alert: { title: string }) => { sent.push(alert.title); return true; },
    now: () => now,
  };
  return { dependencies, sent, read: () => stored, replace: (next: RouteBackgroundState | null) => { stored = next; } };
}

test('background movement emits a route alert once and records its location', async () => {
  const h = harness();
  assert.equal(await processRouteBackgroundUpdate([location], h.dependencies), 'alerted');
  assert.equal(await processRouteBackgroundUpdate([location], h.dependencies), 'updated');
  assert.deepEqual(h.sent, ['Approaching High Street']);
  assert.deepEqual(h.read()?.lastLocation, location);
  assert.equal(h.read()?.lastAlert?.notificationSent, true);
});

test('ignores disabled, expired and generated journeys', async () => {
  for (const initial of [
    { ...state(), enabled: false }, { ...state(), expiresAt: now },
    { ...state(), route: { ...state().route, provider: 'mock' as const } },
  ]) {
    const h = harness(initial);
    assert.equal(await processRouteBackgroundUpdate([location], h.dependencies), 'ignored');
    assert.equal(h.sent.length, 0);
  }
});

test('selects the newest fix and refuses stale or inaccurate locations', async () => {
  const h = harness();
  await processRouteBackgroundUpdate([location, { ...location, longitude: -0.1, timestamp: now - 1000 }], h.dependencies);
  assert.deepEqual(h.read()?.lastLocation, location);
  for (const bad of [
    { ...location, timestamp: now - 31_000 }, { ...location, timestamp: now + 1000 },
    { ...location, accuracyMetres: 999 }, { ...location, latitude: 100 },
  ]) {
    const invalid = harness();
    assert.equal(await processRouteBackgroundUpdate([bad], invalid.dependencies), 'warning');
    assert.equal(invalid.sent.length, 0);
  }
});

test('a stop during risk refresh prevents late alerts and state writes', async () => {
  const h = harness({ ...state(), lastRefreshAt: 0 });
  const outcome = await processRouteBackgroundUpdate([location], {
    ...h.dependencies,
    refresh: async () => {
      h.replace(null);
      return { mode: 'route' as const, samples: [{ id: '0', latitude: 51.5, longitude: -0.092 }], live: {
        calculatedAt: new Date(now).toISOString(), samples: [{ liveScore: 85, contextScore: 20, contributors: [] }],
      } };
    },
  });
  assert.equal(outcome, 'ignored');
  assert.equal(h.read(), null);
  assert.equal(h.sent.length, 0);
});

test('refresh failure preserves the prior route and suppresses approach notifications', async () => {
  const h = harness({ ...state(), lastRefreshAt: 0 });
  assert.equal(await processRouteBackgroundUpdate([location], h.dependencies), 'warning');
  assert.equal(h.sent.length, 0);
  assert.match(h.read()?.warning ?? '', /refresh/i);
});

test('a denied notification still saves an on-screen history entry', async () => {
  const h = harness();
  await processRouteBackgroundUpdate([location], { ...h.dependencies, notify: async () => false });
  assert.equal(h.read()?.lastAlert?.notificationSent, false);
  assert.match(h.read()?.warning ?? '', /notification/i);
});

test('a fresh incident can raise background route risk and trigger an approach alert', async () => {
  const initial = state();
  initial.lastRefreshAt = 0;
  initial.route.sampledRiskScores[0] = { ...initial.route.sampledRiskScores[0], score: 20, riskLevel: 'low' };
  const h = harness(initial);
  const result = await processRouteBackgroundUpdate([location], {
    ...h.dependencies,
    refresh: async () => ({ mode: 'route', samples: [{ id: '0', latitude: 51.5, longitude: -0.092 }], live: {
      calculatedAt: new Date(now).toISOString(), samples: [{ liveScore: 85, contextScore: 20, contributors: [{ reason: 'Road closure nearby' }] }],
    } }),
  });
  assert.equal(result, 'alerted');
  assert.equal(h.read()?.route.sampledRiskScores[0].score, 85);
  assert.match(h.read()?.lastAlert?.body ?? '', /Road closure/);
});
