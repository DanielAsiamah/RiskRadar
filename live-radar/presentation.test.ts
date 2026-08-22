import test from 'node:test';
import assert from 'node:assert/strict';

import {
  findCurrentLiveRadarAlert,
  formatLiveRadarDataMonth,
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
