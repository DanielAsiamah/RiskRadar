import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteBackgroundState, parseRouteBackgroundState, ROUTE_BACKGROUND_MAX_AGE_MS } from './background-storage.ts';
import type { RouteGuardScan } from '../api/route-guard.ts';

const route: RouteGuardScan = {
  provider: 'free-osm', start: 'A', destination: 'B', travelMode: 'walking',
  routePoints: [{ index: 0, label: 'A', latitude: 51, longitude: -1 }, { index: 1, label: 'B', latitude: 51.01, longitude: -1 }],
  sampledRiskScores: [{ pointIndex: 0, latitude: 51, longitude: -1, score: 20, riskLevel: 'low', basis: 'Area risk' }],
  hotzoneSections: [], overallRiskScore: 20, overallRiskLevel: 'low',
  distanceEstimate: { metres: 1000, kilometres: 1 }, durationEstimate: { minutes: 12 }, disclaimer: 'Area intelligence',
  googleRequestMade: false,
  googleCostEstimate: { currency: 'USD', estimatedRequests: 0, estimatedCostUsd: 0, note: 'No Google request' },
  usage: { entitlement: 'pro', includedMonthlyScans: 100, usedBefore: 0, usedAfter: 1, remaining: 99, period: 'calendar-month' },
};

test('round-trips a bounded real route session and starts with a fresh risk check due', () => {
  const state = createRouteBackgroundState(route, 'session-1', 1000);
  assert.deepEqual(parseRouteBackgroundState(JSON.stringify(state)), state);
  assert.equal(state.expiresAt, 1000 + ROUTE_BACKGROUND_MAX_AGE_MS);
  assert.equal(state.lastRefreshAt, 0);
  assert.equal(state.enabled, true);
});

test('rejects missing, corrupt, generated and unbounded route state', () => {
  const state = createRouteBackgroundState(route, 'session-1', 1000);
  for (const value of [
    null, '{', JSON.stringify({}), JSON.stringify({ ...state, route: { ...route, provider: 'mock' } }),
    JSON.stringify({ ...state, route: { ...route, routePoints: [] } }),
    JSON.stringify({ ...state, alertedKeys: Array(101).fill('repeat') }),
    JSON.stringify({ ...state, lastAlert: { title: {} } }),
    JSON.stringify({ ...state, lastLocation: { latitude: 51, longitude: -1, timestamp: 1000, accuracyMetres: -1 } }),
  ]) assert.equal(parseRouteBackgroundState(value), null);
});
