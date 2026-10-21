import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteBackgroundState, parseRouteBackgroundState, ROUTE_BACKGROUND_MAX_AGE_MS } from './background-storage.ts';
import type { RouteGuardScan } from '../api/route-guard.ts';
import { applyRouteLiveRefresh } from './refresh.ts';

const route: RouteGuardScan = {
  provider: 'free-osm', start: 'A', destination: 'B', travelMode: 'walking',
  routePoints: [{ index: 0, label: 'A', latitude: 51, longitude: -1 }, { index: 1, label: 'B', latitude: 51.01, longitude: -1 }],
  sampledRiskScores: [{ pointIndex: 0, latitude: 51, longitude: -1, score: 20, riskLevel: 'low', basis: 'Area risk' }],
  hotzoneSections: [], overallRiskScore: 20, overallRiskLevel: 'low',
  liveIncidentMarkers: [{
    id: 'closure-1', latitude: 51.005, longitude: -1, title: 'Road closure',
    summary: 'Official closure affecting the route.', category: 'road-closure', categoryLabel: 'Road closure',
    severity: 4, color: '#dc2626', softColor: '#fee2e2', affectedRadiusMetres: 300,
    providerLabel: 'Transport for London', verificationLabel: 'Official', locationLabel: 'High Street',
    locationPrecisionLabel: 'Approximate road segment', sourceUpdatedAt: '2026-09-12T12:00:00.000Z',
    sourceUrl: 'https://tfl.gov.uk/traffic/status/',
  }],
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

test('restored incident alert links reject unsafe protocols without losing the journey', () => {
  const state = createRouteBackgroundState(route, 'session-1', 1000);
  const lastAlert = { key: 'incident:flood-1:1:4', title: 'Flood warning ahead', body: 'Official report',
    level: 'red', incidentId: 'flood-1', sourceUrl: 'javascript:alert(1)', observedAt: 'bad timestamp',
    createdAt: 1000, notificationSent: false };
  const restored = parseRouteBackgroundState(JSON.stringify({ ...state, lastAlert }));
  assert.ok(restored);
  assert.equal(restored.lastAlert?.sourceUrl, undefined);
  assert.equal(restored.lastAlert?.observedAt, undefined);
});

test('a busy live route keeps monitoring after restoring its bounded map overlay', () => {
  const incidents = Array.from({ length: 120 }, (_, index) => ({
    id: `incident-${index}`, category: 'road-closure', severity: index === 119 ? 5 : 3,
    centroid: { latitude: 51, longitude: -1 }, sourceUpdatedAt: '2026-09-26T12:00:00Z',
  }));
  const updated = applyRouteLiveRefresh(route.sampledRiskScores, {
    mode: 'route', samples: [{ id: '0', latitude: 51, longitude: -1 }], incidents,
    live: { calculatedAt: '2026-09-26T12:00:00Z', samples: [{
      liveScore: 85, contextScore: 20,
      contributors: incidents.map((item) => ({ incidentId: item.id, reason: 'Active road closure' })),
    }] },
  });
  const stored = createRouteBackgroundState({ ...route, ...updated }, 'busy-route', 1000);
  const restored = parseRouteBackgroundState(JSON.stringify(stored));
  assert.equal(restored?.enabled, true);
  assert.equal(restored?.route.liveIncidentMarkers?.length, 100);
  assert.equal(restored?.route.liveIncidentMarkers?.[0].id, 'incident-119');
  assert.equal(restored?.route.sampledRiskScores[0].contributors?.length, 120);
  assert.equal(restored?.route.overallRiskScore, 85);
});

test('restores unavailable samples without accepting a fabricated numeric unknown score', () => {
  const unavailable: RouteGuardScan = {
    ...route, overallRiskScore: null, overallRiskLevel: 'unknown',
    sampledRiskScores: [{ ...route.sampledRiskScores[0], score: null, riskLevel: 'unknown' }],
  };
  const state = createRouteBackgroundState(unavailable, 'unavailable-route', 1000);
  assert.equal(parseRouteBackgroundState(JSON.stringify(state))?.enabled, true);
  const inconsistent = { ...state, route: { ...unavailable, overallRiskScore: 0 } };
  assert.equal(parseRouteBackgroundState(JSON.stringify(inconsistent)), null);
});

test('restores source coverage and drops malformed metadata without losing the journey', () => {
  const state = createRouteBackgroundState(route, 'source-health', 1000);
  const liveData = {
    checkedAt: '2026-10-13T12:00:00Z', scope: 'source-network', status: 'unavailable',
    sources: [{ sourceId: 'ea', label: 'England floods', state: 'stale', lastSuccessAt: '2026-10-13T10:00:00Z',
      staleAfterMs: 45 * 60_000, coverage: { countries: ['England'], regions: [], kind: 'flood' } }],
  };
  const restored = parseRouteBackgroundState(JSON.stringify({ ...state, route: { ...route, liveData } }));
  assert.deepEqual(restored?.route.liveData, liveData);
  const malformed = parseRouteBackgroundState(JSON.stringify({ ...state, route: { ...route, liveData: { ...liveData, sources: null } } }));
  assert.equal(malformed?.enabled, true);
  assert.equal(malformed?.route.liveData, undefined);
  assert.equal(malformed?.route.liveIncidentMarkers?.[0].id, 'closure-1');
});

test('rejects missing, corrupt, generated and unbounded route state', () => {
  const state = createRouteBackgroundState(route, 'session-1', 1000);
  for (const value of [
    null, '{', JSON.stringify({}), JSON.stringify({ ...state, route: { ...route, provider: 'mock' } }),
    JSON.stringify({ ...state, route: { ...route, routePoints: [] } }),
    JSON.stringify({ ...state, alertedKeys: Array(101).fill('repeat') }),
    JSON.stringify({ ...state, lastAlert: { title: {} } }),
    JSON.stringify({ ...state, lastLocation: { latitude: 51, longitude: -1, timestamp: 1000, accuracyMetres: -1 } }),
    JSON.stringify({ ...state, route: { ...route, liveIncidentMarkers: [{ id: 'bad', latitude: 999 }] } }),
  ]) assert.equal(parseRouteBackgroundState(value), null);
});
