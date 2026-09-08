import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeRouteProgress } from './progress.ts';

test('tracks a position between widely spaced route vertices', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.5, longitude: -0.05 },
    routePoints: [{ latitude: 51.5, longitude: -0.1 }, { latitude: 51.5, longitude: 0 }],
    routeRiskSamples: [],
  });
  assert.equal(progress.status, 'on-route');
  assert.ok(progress.distanceToRouteMetres < 1);
});

test('does not warn about a risk sample already passed on the route', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.5, longitude: -0.049 },
    routePoints: [{ latitude: 51.5, longitude: -0.1 }, { latitude: 51.5, longitude: 0 }],
    routeRiskSamples: [{ latitude: 51.5, longitude: -0.05, pointIndex: 0, score: 80, riskLevel: 'red', basis: 'Incident' }],
  });
  assert.equal(progress.status, 'on-route');
  assert.equal(progress.upcomingHotzone, undefined);
});

test('uses distance along a bend instead of warning across the bend', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.5, longitude: -0.1 },
    routePoints: [
      { latitude: 51.5, longitude: -0.1 },
      { latitude: 51.51, longitude: -0.1 },
      { latitude: 51.51, longitude: -0.099 },
      { latitude: 51.5, longitude: -0.099 },
    ],
    routeRiskSamples: [{ latitude: 51.5, longitude: -0.099, pointIndex: 0, score: 80, riskLevel: 'red', basis: 'Incident' }],
    alertRadiusMetres: 500,
  });
  assert.equal(progress.upcomingHotzone, undefined);
});

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

test('includes the route sample basis in an upcoming hotzone warning', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.478, longitude: -0.0148 },
    routePoints,
    routeRiskSamples: samples,
    alertRadiusMetres: 2500,
  });

  assert.match(progress.message, /Elevated theft pressure/i);
});

test('includes the safe context label in an upcoming hotzone warning', () => {
  const progress = summarizeRouteProgress({
    currentLocation: { latitude: 51.478, longitude: -0.0148 },
    routePoints,
    routeRiskSamples: samples.map((sample) => sample.pointIndex === 2
      ? { ...sample, contextLabel: 'On or near Blackheath Hill' }
      : sample),
    alertRadiusMetres: 2500,
  });

  assert.match(progress.message, /near On or near Blackheath Hill/i);
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
