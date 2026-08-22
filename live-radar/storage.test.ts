import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendAlertHistory,
  createDefaultLiveRadarStore,
  parseLiveRadarStore,
  serializeLiveRadarStore,
} from './storage.ts';
import type { LiveRadarAlertEvent } from './types.ts';

function createEvent(overrides: Partial<LiveRadarAlertEvent> = {}): LiveRadarAlertEvent {
  return {
    id: 'alert_1',
    createdAt: '2026-08-22T10:00:00.000Z',
    postcode: 'SE10 8EP',
    score: 66,
    riskLevel: 'high',
    trigger: 'score-threshold',
    explanation: 'Score reached 65 or above.',
    notificationSent: true,
    ...overrides,
  };
}

test('parses null storage into a safe default store', () => {
  const store = parseLiveRadarStore(null);

  assert.deepEqual(store, createDefaultLiveRadarStore());
});

test('drops malformed storage and recovers to defaults', () => {
  const store = parseLiveRadarStore('{"history":"not-an-array"}');

  assert.deepEqual(store, createDefaultLiveRadarStore());
});

test('serializes and parses a store round-trip', () => {
  const initial = appendAlertHistory(createDefaultLiveRadarStore(), createEvent());
  const raw = serializeLiveRadarStore(initial);
  const reparsed = parseLiveRadarStore(raw);

  assert.deepEqual(reparsed, initial);
});

test('keeps only the newest bounded alert history entries', () => {
  const empty = parseLiveRadarStore(null);
  const withOne = appendAlertHistory(empty, createEvent(), 1);
  const withTwo = appendAlertHistory(withOne, createEvent({
    id: 'alert_2',
    createdAt: '2026-08-22T11:00:00.000Z',
    postcode: 'BR1 5NN',
    score: 52,
    riskLevel: 'elevated',
    trigger: 'sharp-jump',
    explanation: 'Score jumped by at least 12 points.',
    notificationSent: false,
  }), 1);

  assert.equal(withTwo.history.length, 1);
  assert.equal(withTwo.history[0]?.id, 'alert_2');
});

test('preserves the newest alert first in history order', () => {
  const withHistory = appendAlertHistory(
    appendAlertHistory(createDefaultLiveRadarStore(), createEvent({
      id: 'older',
      createdAt: '2026-08-22T09:00:00.000Z',
    })),
    createEvent({
      id: 'newer',
      createdAt: '2026-08-22T10:00:00.000Z',
    }),
  );

  assert.equal(withHistory.history[0]?.id, 'newer');
  assert.equal(withHistory.history[1]?.id, 'older');
});
