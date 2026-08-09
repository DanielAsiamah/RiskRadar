import assert from 'node:assert/strict';
import test from 'node:test';

import { createMockRouteGuardScan, RouteGuardError } from './route-guard.mjs';

const request = {
  start: 'SE10 8EP',
  destination: 'London Bridge',
  travelMode: 'walking',
  entitlement: 'pro',
  routeScansUsed: 12,
};

test('builds a deterministic mock route scan without a Google request', () => {
  const first = createMockRouteGuardScan(request);
  const second = createMockRouteGuardScan(request);

  assert.deepEqual(second, first);
  assert.equal(first.provider, 'mock');
  assert.equal(first.googleRequestMade, false);
  assert.equal(first.travelMode, 'walking');
  assert.ok(first.routePoints.length >= 6);
  assert.ok(first.distanceEstimate.metres > 0);
  assert.ok(first.durationEstimate.minutes > 0);
  assert.equal(first.sampledRiskScores.length, first.routePoints.length);
  assert.ok(['low', 'amber', 'red'].includes(first.overallRiskLevel));
  assert.match(first.disclaimer, /area intelligence/i);
  assert.match(first.disclaimer, /not guaranteed safety/i);
});

test('returns hotzone sections that correspond to elevated sampled points', () => {
  const result = createMockRouteGuardScan(request);

  for (const hotzone of result.hotzoneSections) {
    assert.ok(hotzone.riskScore >= 60);
    assert.ok(hotzone.startPointIndex >= 0);
    assert.ok(hotzone.endPointIndex < result.routePoints.length);
    assert.ok(['amber', 'red'].includes(hotzone.riskLevel));
  }
});

test('reports the PRO monthly allowance and planning-only Google estimate', () => {
  const result = createMockRouteGuardScan(request);

  assert.deepEqual(result.usage, {
    entitlement: 'pro',
    includedMonthlyScans: 100,
    usedBefore: 12,
    usedAfter: 13,
    remaining: 87,
    period: 'calendar-month',
  });
  assert.equal(result.googleCostEstimate.currency, 'USD');
  assert.equal(result.googleCostEstimate.estimatedRequests, 1);
  assert.ok(result.googleCostEstimate.estimatedCostUsd > 0);
  assert.match(result.googleCostEstimate.note, /no Google request/i);
});

test('rejects non-PRO access and exhausted monthly usage', () => {
  assert.throws(
    () => createMockRouteGuardScan({ ...request, entitlement: 'free' }),
    (error) => error instanceof RouteGuardError && error.statusCode === 403 && error.code === 'PREMIUM_REQUIRED',
  );
  assert.throws(
    () => createMockRouteGuardScan({ ...request, routeScansUsed: 100 }),
    (error) => error instanceof RouteGuardError && error.statusCode === 429 && error.code === 'ROUTE_SCAN_LIMIT_REACHED',
  );
});

test('validates route locations, travel mode, and usage', () => {
  for (const invalidRequest of [
    { ...request, start: '' },
    { ...request, destination: '' },
    { ...request, travelMode: 'cycling' },
    { ...request, routeScansUsed: -1 },
  ]) {
    assert.throws(
      () => createMockRouteGuardScan(invalidRequest),
      (error) => error instanceof RouteGuardError && error.statusCode === 400 && error.code === 'INVALID_ROUTE_GUARD_INPUT',
    );
  }
});
