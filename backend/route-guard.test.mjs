import assert from 'node:assert/strict';
import test from 'node:test';

import { createFreeRouteGuardScan, createMockRouteGuardScan, RouteGuardError } from './route-guard.mjs';

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

test('builds a free UK route scan from injected geocoding, routing, and risk samplers', async () => {
  const calls = [];
  const result = await createFreeRouteGuardScan(
    { ...request, start: 'SE10 8EP', destination: 'London Bridge', routeScansUsed: 2 },
    {
      geocodeLocation: async (query) => {
        calls.push(`geocode:${query}`);
        return {
          query,
          label: query === 'SE10 8EP' ? 'SE10 8EP, Greenwich, London' : 'London Bridge Station',
          latitude: query === 'SE10 8EP' ? 51.4748 : 51.5055,
          longitude: query === 'SE10 8EP' ? -0.0158 : -0.0865,
          confidence: 'high',
          source: 'test-geocoder',
        };
      },
      fetchRoute: async ({ startPoint, destinationPoint, travelMode }) => {
        calls.push(`route:${travelMode}:${startPoint.latitude}:${destinationPoint.latitude}`);
        return {
          provider: 'free-osm',
          routingMode: 'foot',
          distanceMetres: 6200,
          durationSeconds: 5100,
          routePoints: [
            { latitude: startPoint.latitude, longitude: startPoint.longitude },
            { latitude: 51.486, longitude: -0.034 },
            { latitude: 51.497, longitude: -0.061 },
            { latitude: destinationPoint.latitude, longitude: destinationPoint.longitude },
          ],
          attribution: 'OpenStreetMap contributors; OSRM',
        };
      },
      sampleRisk: async (point, index) => ({
        score: [22, 64, 81, 35][index],
        basis: `RiskRadar route sample ${index + 1}`,
        contributors: index === 2 ? [{ incidentId: 'live-flood-1', category: 'flood' }] : [],
      }),
    },
  );

  assert.deepEqual(calls, [
    'geocode:SE10 8EP',
    'geocode:London Bridge',
    'route:walking:51.4748:51.5055',
  ]);
  assert.equal(result.provider, 'free-osm');
  assert.equal(result.googleRequestMade, false);
  assert.equal(result.googleCostEstimate.estimatedRequests, 0);
  assert.equal(result.googleCostEstimate.estimatedCostUsd, 0);
  assert.equal(result.routeProvider.routingMode, 'foot');
  assert.match(result.routeProvider.attribution, /OpenStreetMap/);
  assert.equal(result.geocoded.start.label, 'SE10 8EP, Greenwich, London');
  assert.equal(result.geocoded.destination.label, 'London Bridge Station');
  assert.equal(result.routePoints.length, 4);
  assert.equal(result.sampledRiskScores.length, 4);
  assert.equal(result.sampledRiskScores[2].score, 81);
  assert.deepEqual(result.sampledRiskScores[2].contributors, [{ incidentId: 'live-flood-1', category: 'flood' }]);
  assert.ok(result.hotzoneSections.some((hotzone) => hotzone.riskLevel === 'red'));
  assert.equal(result.usage.usedAfter, 3);
  assert.match(result.disclaimer, /area intelligence/i);
});

test('uses a transparent walking corridor estimate for transit until live transit routing is connected', async () => {
  const result = await createFreeRouteGuardScan(
    { ...request, travelMode: 'transit' },
    {
      geocodeLocation: async (query) => ({
        query,
        label: query,
        latitude: query === request.start ? 51.47 : 51.5,
        longitude: query === request.start ? -0.02 : -0.08,
        confidence: 'high',
        source: 'test-geocoder',
      }),
      fetchRoute: async ({ startPoint, destinationPoint, routingProfile }) => ({
        provider: 'free-osm',
        routingMode: routingProfile,
        distanceMetres: 5200,
        durationSeconds: 4200,
        routePoints: [startPoint, destinationPoint],
        attribution: 'OpenStreetMap contributors; OSRM',
      }),
      sampleRisk: async () => ({ score: 30, basis: 'test risk' }),
    },
  );

  assert.equal(result.travelMode, 'transit');
  assert.equal(result.routeProvider.routingMode, 'foot');
  assert.match(result.routeProvider.modeDisclosure, /Transit routing is estimated/i);
});

test('keeps the free route scan when an individual risk sample is unavailable', async () => {
  const result = await createFreeRouteGuardScan(
    request,
    {
      geocodeLocation: async (query) => ({
        query,
        label: query,
        latitude: query === request.start ? 51.47 : 51.5,
        longitude: query === request.start ? -0.02 : -0.08,
        confidence: 'high',
        source: 'test-geocoder',
      }),
      fetchRoute: async ({ startPoint, destinationPoint }) => ({
        provider: 'free-osm',
        routingMode: 'foot',
        distanceMetres: 5200,
        durationSeconds: 4200,
        routePoints: [startPoint, { latitude: 51.48, longitude: -0.04 }, destinationPoint],
        attribution: 'OpenStreetMap contributors; OSRM',
      }),
      sampleRisk: async (_point, index) => {
        if (index === 1) throw new Error('public crime API busy');
        return { score: 42, basis: 'test risk' };
      },
    },
  );

  assert.equal(result.provider, 'free-osm');
  assert.equal(result.sampledRiskScores[1].score, 35);
  assert.match(result.sampledRiskScores[1].basis, /temporarily unavailable/i);
});

test('does not trust unrealistically fast walking durations from a public route provider', async () => {
  const result = await createFreeRouteGuardScan(
    { ...request, travelMode: 'walking' },
    {
      geocodeLocation: async (query) => ({
        query,
        label: query,
        latitude: query === request.start ? 51.47 : 51.5,
        longitude: query === request.start ? -0.02 : -0.08,
        confidence: 'high',
        source: 'test-geocoder',
      }),
      fetchRoute: async ({ startPoint, destinationPoint }) => ({
        provider: 'free-osm',
        routingMode: 'foot',
        distanceMetres: 7800,
        durationSeconds: 1000,
        routePoints: [startPoint, destinationPoint],
        attribution: 'OpenStreetMap contributors; OSRM',
      }),
      sampleRisk: async () => ({ score: 35, basis: 'test risk' }),
    },
  );

  assert.ok(result.durationEstimate.minutes >= 100);
});
