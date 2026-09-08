import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRouteApproachAlert, deliverRouteNotification } from './alerts.ts';
import type { RouteGuardProgressSummary } from './progress.ts';
import { summarizeRouteProgress } from './progress.ts';

const progress: RouteGuardProgressSummary = {
  status: 'on-route', distanceToRouteMetres: 5, message: 'Approaching',
  upcomingHotzone: {
    latitude: 51.5, longitude: -0.1, pointIndex: 2, score: 72,
    riskLevel: 'amber', basis: 'Reported disruption', contextLabel: 'On or near High Street', distanceMetres: 180,
  },
};
const input = {
  progress, tracking: true, provider: 'free-osm', accuracyMetres: 15,
  locationTimestamp: 100_000, now: 110_000, alertedKeys: new Set<string>(),
};

test('creates a road-specific approach alert with score and route distance', () => {
  const alert = evaluateRouteApproachAlert(input);
  assert.ok(alert);
  assert.equal(alert.title, 'Approaching High Street');
  assert.match(alert.body, /72\/100 AMBER/);
  assert.match(alert.body, /180 m away/);
  assert.match(alert.body, /Reported disruption/);
});

test('suppresses repeat sections but allows a severity escalation', () => {
  const alert = evaluateRouteApproachAlert(input)!;
  const alertedKeys = new Set([alert.key]);
  assert.equal(evaluateRouteApproachAlert({ ...input, alertedKeys }), null);
  const escalated = evaluateRouteApproachAlert({ ...input, alertedKeys,
    progress: { ...progress, upcomingHotzone: { ...progress.upcomingHotzone!, riskLevel: 'red', score: 85 } },
  });
  assert.equal(escalated?.level, 'red');
});

test('does not alert for paused, mock, off-route, missing or unreliable readings', () => {
  for (const override of [
    { tracking: false }, { provider: 'mock' }, { progress: null },
    { progress: { ...progress, status: 'off-route' as const } },
    { progress: { ...progress, upcomingHotzone: undefined } },
    { accuracyMetres: 101 }, { accuracyMetres: null }, { accuracyMetres: NaN },
    { accuracyMetres: -1 }, { locationTimestamp: null }, { locationTimestamp: 79_999 },
    { locationTimestamp: 120_000 },
  ]) assert.equal(evaluateRouteApproachAlert({ ...input, ...override }), null);
});

test('notification delivery handles unavailable, denied and rejected browser APIs', () => {
  const alert = evaluateRouteApproachAlert(input)!;
  assert.equal(deliverRouteNotification(alert, undefined), false);
  class Denied {
    static permission = 'denied';
    constructor() { throw new Error('Must not construct'); }
  }
  assert.equal(deliverRouteNotification(alert, Denied), false);
  class Unsupported {
    static permission = 'granted';
    constructor() { throw new Error('Constructor unavailable'); }
  }
  assert.equal(deliverRouteNotification(alert, Unsupported), false);
});

test('delivers the road warning with a stable browser notification tag', () => {
  const alert = evaluateRouteApproachAlert(input)!;
  const sent: unknown[] = [];
  class Available {
    static permission = 'granted';
    constructor(title: string, options: { body: string; tag: string }) { sent.push({ title, ...options }); }
  }
  assert.equal(deliverRouteNotification(alert, Available), true);
  assert.deepEqual(sent, [{ title: alert.title, body: alert.body, tag: `riskradar-route-${alert.key}` }]);
});

test('movement enters the alert corridor once and stops warning after passing it', () => {
  const alertedKeys = new Set<string>();
  const emitted: string[] = [];
  for (const longitude of [-0.1, -0.095, -0.094, -0.091]) {
    const movement = summarizeRouteProgress({
      currentLocation: { latitude: 51.5, longitude },
      routePoints: [{ latitude: 51.5, longitude: -0.1 }, { latitude: 51.5, longitude: -0.09 }],
      routeRiskSamples: [{ ...progress.upcomingHotzone!, longitude: -0.092 }],
      alertRadiusMetres: 500,
    });
    const alert = evaluateRouteApproachAlert({ ...input, progress: movement, alertedKeys });
    if (alert) {
      alertedKeys.add(alert.key);
      emitted.push(alert.title);
    }
    if (longitude === -0.1 || longitude === -0.091) assert.equal(movement.upcomingHotzone, undefined);
  }
  assert.deepEqual(emitted, ['Approaching High Street']);
});
