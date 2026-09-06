import assert from 'node:assert/strict';
import test from 'node:test';

import { formatRouteGuardAlert } from './presentation.ts';
import type { RouteGuardProgressSummary } from './progress.ts';

const approachingProgress: RouteGuardProgressSummary = {
  status: 'on-route',
  distanceToRouteMetres: 12,
  nearestSample: {
    pointIndex: 1,
    latitude: 51.4781,
    longitude: -0.0149,
    score: 44,
    riskLevel: 'low',
    basis: 'Quiet sample',
    distanceMetres: 12,
  },
  upcomingHotzone: {
    pointIndex: 2,
    latitude: 51.486,
    longitude: -0.04,
    score: 78,
    riskLevel: 'red',
    basis: 'Historical RiskRadar baseline plus active live-source impact near this route sample.',
    contextLabel: 'On or near Blackheath Hill',
    distanceMetres: 386,
  },
  message: 'Approaching elevated route section near On or near Blackheath Hill in about 386 m: 78/100 RED.',
};

test('formats an upcoming hotzone as a road-specific warning card', () => {
  const alert = formatRouteGuardAlert(approachingProgress);

  assert.equal(alert.level, 'red');
  assert.equal(alert.title, 'Approaching Blackheath Hill');
  assert.equal(alert.scoreLabel, '78/100 RED');
  assert.equal(alert.distanceLabel, '386 m away');
  assert.match(alert.detail, /active live-source impact/i);
  assert.equal(alert.action, 'Consider a safer route or stay more aware through this section.');
});

test('formats on-route low risk as a calm tracking card', () => {
  const alert = formatRouteGuardAlert({
    status: 'on-route',
    distanceToRouteMetres: 8,
    nearestSample: {
      pointIndex: 1,
      latitude: 51.4781,
      longitude: -0.0149,
      score: 31,
      riskLevel: 'low',
      basis: 'Historical RiskRadar baseline and current time context near this route sample.',
      contextLabel: 'Greenwich High Road',
      distanceMetres: 8,
    },
    message: 'You are tracking the scanned route. 31/100 LOW near your current route position.',
  });

  assert.equal(alert.level, 'low');
  assert.equal(alert.title, 'Tracking Greenwich High Road');
  assert.equal(alert.scoreLabel, '31/100 LOW');
  assert.equal(alert.action, 'Continue following your scanned route.');
});

test('formats off-route state with a re-scan action', () => {
  const alert = formatRouteGuardAlert({
    status: 'off-route',
    distanceToRouteMetres: 1234,
    message: 'You are about 1.2 km away from the scanned route. Re-scan if your route changed.',
  });

  assert.equal(alert.level, 'amber');
  assert.equal(alert.title, 'Away from scanned route');
  assert.equal(alert.distanceLabel, '1.2 km away');
  assert.equal(alert.action, 'Re-scan Route Guard if your journey changed.');
});
