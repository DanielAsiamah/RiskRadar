import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateRouteApproachAlert } from './alerts.ts';
import { summarizeRouteProgress } from './progress.ts';
import type { RouteGuardRiskSample } from '../api/route-guard.ts';
import type { RouteLiveData } from './live-data.ts';

const now = Date.parse('2026-10-17T12:00:00Z');
const incident = {
  incidentId: 'flood-1', version: 2, provider: 'environment-agency', title: 'Flood warning',
  locationLabel: 'River walk', severity: 4, verificationLabel: 'Official',
  observedAt: new Date(now - 60_000).toISOString(), expiresAt: new Date(now + 3_600_000).toISOString(),
  sourceUrl: 'https://check-for-flooding.service.gov.uk/',
};
const routePoints = [{ latitude: 51.5, longitude: -0.1 }, { latitude: 51.5, longitude: -0.09 }];
const currentLocation = { latitude: 51.5, longitude: -0.095 };
const samples: RouteGuardRiskSample[] = [{ pointIndex: 1, latitude: 51.5, longitude: -0.092,
  score: null, riskLevel: 'unknown', basis: 'Historical data unavailable',
  contributors: [{ incidentId: 'flood-1', incidentAlert: incident }] }];
const liveData = {
  checkedAt: new Date(now).toISOString(), scope: 'source-network', status: 'limited',
  sources: [{ sourceId: 'ea', provider: 'environment-agency', label: 'Environment Agency', state: 'healthy',
    lastSuccessAt: new Date(now - 60_000).toISOString(), staleAfterMs: 1_800_000,
    coverage: { countries: ['England'], regions: [], kind: 'flood' } }],
} as RouteLiveData;
function input() {
  return {
    progress: summarizeRouteProgress({ currentLocation, routePoints,
      routeRiskSamples: samples.map((sample) => ({ ...sample, latitude: sample.latitude!, longitude: sample.longitude! })) }),
    tracking: true, provider: 'free-osm', accuracyMetres: 10, locationTimestamp: now, now,
    alertedKeys: new Set<string>(), incidentContext: { currentLocation, routePoints, samples, liveData },
  };
}

test('official incident ahead alerts without a historical score and links its evidence', () => {
  const alert = evaluateRouteApproachAlert(input());
  assert.ok(alert);
  assert.equal(alert.title, 'Flood warning ahead');
  assert.equal(alert.level, 'red');
  assert.match(alert.body, /River walk/);
  assert.match(alert.body, /Official/);
  assert.match(alert.body, /affected route section/);
  assert.doesNotMatch(alert.body, /\d+\/100|guaranteed|safer route available/i);
  assert.equal(alert.sourceUrl, incident.sourceUrl);
  assert.equal(alert.incidentId, 'flood-1');
});

test('same incident across samples or updates alerts once unless severity increases', () => {
  const first = evaluateRouteApproachAlert(input());
  assert.ok(first);
  const repeat = input();
  repeat.alertedKeys.add(first.key);
  repeat.incidentContext.samples = [samples[0], { ...samples[0], pointIndex: 2 }];
  assert.equal(evaluateRouteApproachAlert(repeat), null);
  repeat.incidentContext.samples = [{ ...samples[0], contributors: [{ incidentId: 'flood-1',
    incidentAlert: { ...incident, version: 3 } }] }];
  assert.equal(evaluateRouteApproachAlert(repeat), null);
  repeat.incidentContext.samples = [{ ...samples[0], contributors: [{ incidentId: 'flood-1',
    incidentAlert: { ...incident, version: 3, severity: 5 } }] }];
  assert.ok(evaluateRouteApproachAlert(repeat));
});

test('an incident warning is not immediately repeated as a numeric warning for the same section', () => {
  const candidate = input();
  candidate.incidentContext.samples = [{ ...samples[0], score: 85, riskLevel: 'red' }];
  candidate.progress = summarizeRouteProgress({ currentLocation, routePoints,
    routeRiskSamples: candidate.incidentContext.samples.map((sample) => ({ ...sample, latitude: sample.latitude!, longitude: sample.longitude! })) });
  const first = evaluateRouteApproachAlert(candidate);
  assert.ok(first?.incidentId);
  candidate.alertedKeys.add(first.key);
  assert.equal(evaluateRouteApproachAlert(candidate), null);
});

test('stale, disconnected, mismatched or absent source health suppresses incident alerts', () => {
  for (const changed of [
    undefined,
    { ...liveData, status: 'unavailable' },
    { ...liveData, sources: [{ ...liveData.sources[0], state: 'failed' }] },
    { ...liveData, sources: [{ ...liveData.sources[0], provider: 'different-provider' }] },
    { ...liveData, sources: [{ ...liveData.sources[0], lastSuccessAt: new Date(now - 1_800_000).toISOString() }] },
  ]) {
    const candidate = input();
    assert.equal(evaluateRouteApproachAlert({ ...candidate,
      incidentContext: { ...candidate.incidentContext, liveData: changed as RouteLiveData | undefined } }), null);
  }
});

test('invalid, expired and unverified incident facts never become alerts or unsafe links', () => {
  for (const changed of [null, {}, { ...incident, severity: 2 }, { ...incident, version: 0 },
    { ...incident, verificationLabel: 'Unverified' }, { ...incident, expiresAt: new Date(now).toISOString() },
    { ...incident, observedAt: new Date(now + 60_001).toISOString() },
  ]) {
    const candidate = input();
    candidate.incidentContext.samples = [{ ...samples[0], contributors: [{ incidentAlert: changed }] }];
    assert.equal(evaluateRouteApproachAlert(candidate), null);
  }
  const candidate = input();
  candidate.incidentContext.samples = [{ ...samples[0], contributors: [{ incidentId: 'flood-1',
    incidentAlert: { ...incident, sourceUrl: 'javascript:alert(1)' } }] }];
  assert.equal(evaluateRouteApproachAlert(candidate)?.sourceUrl, undefined);
});

test('incident warnings respect passed sections, bends, paused tracking and unreliable GPS', () => {
  for (const override of [{ tracking: false }, { provider: 'mock' }, { accuracyMetres: 101 },
    { locationTimestamp: now - 30_001 }, { progress: { ...input().progress, status: 'off-route' as const } }]) {
    assert.equal(evaluateRouteApproachAlert({ ...input(), ...override }), null);
  }
  const passed = input();
  passed.incidentContext.currentLocation = { latitude: 51.5, longitude: -0.091 };
  assert.equal(evaluateRouteApproachAlert(passed), null);
  const bend = input();
  bend.incidentContext.currentLocation = routePoints[0];
  bend.incidentContext.routePoints = [routePoints[0], { latitude: 51.51, longitude: -0.1 },
    { latitude: 51.51, longitude: -0.092 }, { latitude: 51.5, longitude: -0.092 }];
  assert.equal(evaluateRouteApproachAlert(bend), null);
});
