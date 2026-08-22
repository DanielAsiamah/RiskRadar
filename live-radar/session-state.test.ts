import test from 'node:test';
import assert from 'node:assert/strict';

import {
  disableLiveRadarStore,
  restoreLiveRadarStoreForPlatform,
  shouldStopLiveRadarForEntitlement,
} from './session-state.ts';
import { createDefaultLiveRadarStore } from './storage.ts';

test('does not restore a web keep-open session as active after a page reload', () => {
  const store = createDefaultLiveRadarStore();
  store.settings.enabled = true;
  store.settings.mode = 'web-session';

  const restored = restoreLiveRadarStoreForPlatform(store, 'web');

  assert.equal(restored.settings.enabled, false);
  assert.match(restored.lastWarning ?? '', /page.*closed|start.*again/i);
});

test('preserves native background state for the registered OS task', () => {
  const store = createDefaultLiveRadarStore();
  store.settings.enabled = true;
  store.settings.mode = 'native-background';

  assert.deepEqual(restoreLiveRadarStoreForPlatform(store, 'native'), store);
});

test('disables persisted monitoring before an OS task is stopped', () => {
  const store = createDefaultLiveRadarStore();
  store.settings.enabled = true;

  const disabled = disableLiveRadarStore(store);

  assert.equal(disabled.settings.enabled, false);
  assert.equal(store.settings.enabled, true);
});

test('stops native monitoring when a resolved entitlement is no longer Premium', () => {
  const store = createDefaultLiveRadarStore();
  store.settings.enabled = true;
  store.settings.mode = 'native-background';

  assert.equal(shouldStopLiveRadarForEntitlement({
    platform: 'native',
    store,
    entitlementResolved: true,
    premium: false,
  }), true);
  assert.equal(shouldStopLiveRadarForEntitlement({
    platform: 'native',
    store,
    entitlementResolved: false,
    premium: false,
  }), false);
  assert.equal(shouldStopLiveRadarForEntitlement({
    platform: 'web',
    store,
    entitlementResolved: true,
    premium: false,
  }), false);
});
