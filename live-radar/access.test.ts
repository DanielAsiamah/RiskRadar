import test from 'node:test';
import assert from 'node:assert/strict';

import { getLiveRadarAccess, hasRequiredLiveRadarPermissions } from './access.ts';

test('allows the keep-open web Journey Radar without Premium', () => {
  const access = getLiveRadarAccess({ platform: 'web', premium: false });

  assert.equal(access.canStart, true);
  assert.equal(access.mode, 'web-session');
  assert.equal(access.showUpgradeGate, false);
  assert.equal(access.requiresBackgroundPermission, false);
  assert.deepEqual(access.requiredPermissions, ['foreground']);
});

test('keeps native background Live Radar behind Premium', () => {
  const freeAccess = getLiveRadarAccess({ platform: 'native', premium: false });
  const premiumAccess = getLiveRadarAccess({ platform: 'native', premium: true });

  assert.equal(freeAccess.canStart, false);
  assert.equal(freeAccess.showUpgradeGate, true);
  assert.equal(premiumAccess.canStart, true);
  assert.equal(premiumAccess.mode, 'native-background');
  assert.equal(premiumAccess.requiresBackgroundPermission, true);
  assert.deepEqual(premiumAccess.requiredPermissions, ['foreground', 'background']);
});

test('requires both native location permissions before activation', () => {
  const access = getLiveRadarAccess({ platform: 'native', premium: true });

  assert.equal(hasRequiredLiveRadarPermissions(access, {
    foreground: 'granted',
    background: 'denied',
    notifications: 'denied',
  }), false);
  assert.equal(hasRequiredLiveRadarPermissions(access, {
    foreground: 'granted',
    background: 'granted',
    notifications: 'denied',
  }), true);
});
