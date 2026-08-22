import test from 'node:test';
import assert from 'node:assert/strict';

import { processLiveRadarBackgroundUpdate } from './background-processor.ts';
import { createDefaultLiveRadarStore } from './storage.ts';
import type { LiveRadarReading, LiveRadarStore } from './types.ts';

function createReading(overrides: Partial<LiveRadarReading> = {}): LiveRadarReading {
  return {
    checkedAt: '2026-08-22T12:00:00.000Z',
    postcode: 'SE10 8EP',
    score: 68,
    riskLevel: 'high',
    mainReason: 'Violent crime is the leading local pressure.',
    dataMonth: '2026-06',
    accuracyMetres: 24,
    accuracyState: 'good',
    source: 'background',
    ...overrides,
  };
}

function createEnabledStore(): LiveRadarStore {
  const store = createDefaultLiveRadarStore();
  return {
    ...store,
    settings: {
      ...store.settings,
      enabled: true,
      onboardingCompleted: true,
    },
    currentReading: createReading({
      checkedAt: '2026-08-22T11:40:00.000Z',
      postcode: 'BR1 5NN',
      score: 42,
      riskLevel: 'moderate',
    }),
  };
}

test('ignores a background wake after Live Radar has been turned off', async () => {
  let scanCalled = false;
  let saveCalled = false;

  const result = await processLiveRadarBackgroundUpdate(
    {
      data: {
        locations: [{ coords: { latitude: 51.48, longitude: -0.01, accuracy: 20 } }],
      },
      error: null,
    },
    {
      loadStore: async () => createDefaultLiveRadarStore(),
      saveStore: async () => { saveCalled = true; },
      scanCoordinates: async () => {
        scanCalled = true;
        throw new Error('disabled monitoring must not scan');
      },
      sendNotification: async () => ({ delivered: false as const }),
      nowIso: () => '2026-08-22T12:00:00.000Z',
      createAlertId: () => 'alert_background_1',
    },
  );

  assert.equal(result.status, 'ignored');
  assert.equal(scanCalled, false);
  assert.equal(saveCalled, false);
});

test('processes the latest background location and persists an eligible alert', async () => {
  let savedStore: LiveRadarStore | null = null;
  let notificationPostcode = '';

  const result = await processLiveRadarBackgroundUpdate(
    {
      data: {
        locations: [
          { coords: { latitude: 51.47, longitude: -0.02, accuracy: 35 } },
          { coords: { latitude: 51.48, longitude: -0.01, accuracy: 24 } },
        ],
      },
      error: null,
    },
    {
      loadStore: async () => createEnabledStore(),
      saveStore: async (store) => { savedStore = store; },
      scanCoordinates: async (input) => {
        assert.equal(input.latitude, 51.48);
        assert.equal(input.longitude, -0.01);
        assert.equal(input.source, 'background');
        return { ok: true as const, postcode: 'SE10 8EP', reading: createReading() };
      },
      sendNotification: async (input) => {
        notificationPostcode = input.postcode;
        return { delivered: true as const };
      },
      nowIso: () => '2026-08-22T12:00:00.000Z',
      createAlertId: () => 'alert_background_1',
    },
  );

  assert.equal(result.status, 'alerted');
  if (result.status !== 'alerted') assert.fail('expected an alerted background result');
  assert.equal(notificationPostcode, 'SE10 8EP');
  assert.equal(result.store.currentReading?.postcode, 'SE10 8EP');
  assert.equal(result.store.history[0]?.id, 'alert_background_1');
  assert.equal(result.store.history[0]?.notificationSent, true);
  assert.equal(result.store.settings.lastAlertAt, '2026-08-22T12:00:00.000Z');
  assert.deepEqual(savedStore, result.store);
});

test('skips an imprecise background location without creating a danger alert', async () => {
  let savedStore: LiveRadarStore | null = null;
  let scanCalled = false;

  const result = await processLiveRadarBackgroundUpdate(
    {
      data: {
        locations: [{ coords: { latitude: 51.48, longitude: -0.01, accuracy: 900 } }],
      },
      error: null,
    },
    {
      loadStore: async () => createEnabledStore(),
      saveStore: async (store) => { savedStore = store; },
      scanCoordinates: async () => {
        scanCalled = true;
        throw new Error('poor background accuracy must not scan');
      },
      sendNotification: async () => ({ delivered: false as const }),
      nowIso: () => '2026-08-22T12:00:00.000Z',
      createAlertId: () => 'alert_background_1',
    },
  );

  assert.equal(result.status, 'warning');
  if (result.status !== 'warning') assert.fail('expected a warning background result');
  assert.equal(scanCalled, false);
  assert.match(result.store.lastWarning ?? '', /accuracy/i);
  assert.equal(result.store.history.length, 0);
  assert.deepEqual(savedStore, result.store);
});

test('records an eligible alert and explains when its device banner was not delivered', async () => {
  const result = await processLiveRadarBackgroundUpdate(
    {
      data: {
        locations: [{ coords: { latitude: 51.48, longitude: -0.01, accuracy: 24 } }],
      },
      error: null,
    },
    {
      loadStore: async () => createEnabledStore(),
      saveStore: async () => undefined,
      scanCoordinates: async () => ({
        ok: true as const,
        postcode: 'SE10 8EP',
        reading: createReading(),
      }),
      sendNotification: async () => ({ delivered: false as const, reason: 'permission-denied' }),
      nowIso: () => '2026-08-22T12:00:00.000Z',
      createAlertId: () => 'alert_background_no_banner',
    },
  );

  assert.equal(result.status, 'alerted');
  if (result.status !== 'alerted') assert.fail('expected an alerted background result');
  assert.equal(result.store.history[0]?.notificationSent, false);
  assert.match(result.store.lastWarning ?? '', /saved locally|banner/i);
});
