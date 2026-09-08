import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findCurrentLiveRadarAlert,
  formatLiveRadarDataMonth,
  formatLiveSourceNetworkSummary,
} from './presentation.ts';
import type { LiveRadarAlertEvent, LiveRadarReading } from './types.ts';

const reading: LiveRadarReading = {
  checkedAt: '2026-08-22T12:00:00.000Z',
  postcode: 'SE10 8EP',
  score: 68,
  riskLevel: 'high',
  mainReason: 'Violent crime is the leading local pressure.',
  dataMonth: '2026-06',
  accuracyMetres: 24,
  accuracyState: 'good',
  source: 'web-session',
};

const alert: LiveRadarAlertEvent = {
  id: 'alert_web_1',
  createdAt: reading.checkedAt,
  postcode: reading.postcode,
  score: reading.score,
  riskLevel: reading.riskLevel,
  trigger: 'score-threshold',
  explanation: 'The local score reached 65 or above.',
  notificationSent: false,
};

test('finds an alert created by the current reading for an on-screen banner', () => {
  assert.deepEqual(findCurrentLiveRadarAlert(reading, [alert]), alert);
  assert.equal(findCurrentLiveRadarAlert(reading, [{ ...alert, createdAt: '2026-08-22T11:00:00.000Z' }]), null);
});

test('formats the recorded police data month for the status card', () => {
  assert.equal(formatLiveRadarDataMonth('2026-06'), 'June 2026');
  assert.equal(formatLiveRadarDataMonth('bad-value'), null);
  assert.equal(formatLiveRadarDataMonth(null), null);
});

test('summarises a healthy live source network with active incidents', () => {
  const summary = formatLiveSourceNetworkSummary({
    network: {
      status: 'healthy',
      persistent: false,
      durability: 'memory',
      disclosure: 'Live incident history is stored in memory for local development.',
    },
    sources: [
      { sourceId: 'environment-agency-floods-england', state: 'healthy' },
      { sourceId: 'flood-wales', state: 'not-configured' },
    ],
    incidents: [
      { id: 'inc_1', title: 'Flood alert near River Ravensbourne', verificationLevel: 'Official' },
      { id: 'inc_2', title: 'Surface water flooding', verificationLevel: 'Official' },
    ],
  });

  assert.equal(summary.tone, 'healthy');
  assert.equal(summary.title, 'Live safety network online');
  assert.equal(summary.metric, '2 active');
  assert.match(summary.detail, /1 live source healthy/i);
  assert.match(summary.detail, /2 active public incidents/i);
  assert.match(summary.disclosure, /memory for local development/i);
});

test('summarises a limited live source network without incidents', () => {
  const summary = formatLiveSourceNetworkSummary({
    network: {
      status: 'limited',
      persistent: false,
      durability: 'memory',
      disclosure: 'No live source has reported a successful poll yet.',
    },
    sources: [
      { sourceId: 'environment-agency-floods-england', state: 'failed' },
    ],
    incidents: [],
  });

  assert.equal(summary.tone, 'limited');
  assert.equal(summary.title, 'Live network warming up');
  assert.equal(summary.metric, '0 active');
  assert.match(summary.detail, /No active public incidents/i);
});
