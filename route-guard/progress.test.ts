import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeRouteProgress } from './progress.ts';

const routePoints = [
  { latitude: 51.4762, longitude: -0.0005 },
  { latitude: 51.4781, longitude: -0.0149 },
  { latitude: 51.486, longitude: -0.04 },
  { latitude: 51.5, longitude: -0.08 },
];

const samples = [
  { pointIndex: 0, latitude: 51.4762, longitude: -0.0005, score: 28, riskLevel: 'low' as const, basis: 'Start sample' },
  { pointIndex: 1, latitude: 51.4781, longitude: -0.0149, score: 44, riskLevel: 'low' as const, basis: 'Quiet sample' },
  { pointIndex: 2, latitude: 51.486, longitude: -0.04, score: 71, riskLevel: 'amber' as const, basis: 'Elevated theft pressure' },
  { pointIndex: 3, latitude: 51.5, longitude: -0.08, score: 82, riskLevel: 'red' as const, basis: 'Active incident impact' },
];

test('summarises the nearest route risk sample for the current location', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.478, longitude: -0.0148 },
    routePoints,
    routeRiskSamples: samples,
  });

  assert.equal(progress.status, 'on-route');
  assert.equal(progress.nearestSample?.pointIndex, 1);
  assert.equal(progress.nearestSample?.score, 44);
  assert.ok(progress.distanceToRouteMetres < 30);
});

test('finds the next elevated route sample ahead of the user', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.478, longitude: -0.0148 },
    routePoints,
    routeRiskSamples: samples,
    alertRadiusMetres: 2500,
  });

  assert.equal(progress.upcomingHotzone?.pointIndex, 2);
  assert.equal(progress.upcomingHotzone?.riskLevel, 'amber');
  assert.match(progress.message, /Approaching elevated route section/i);
});

test('marks the journey as off route when the closest sample is too far away', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.6, longitude: -0.3 },
    routePoints,
    routeRiskSamples: samples,
  });

  assert.equal(progress.status, 'off-route');
  assert.match(progress.message, /away from the scanned route/i);
});
