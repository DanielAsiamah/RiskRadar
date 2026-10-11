import assert from 'node:assert/strict';
import test from 'node:test';
import { routeGuardAccessState, shouldRecordRouteUsage } from './access.ts';

test('a server-confirmed local session can scan without an account or paid quota', () => {
  const state = routeGuardAccessState({ premium: false, localDevelopment: true, usageReady: false, routeScansUsed: 100 });
  assert.equal(state.canAccess, true);
  assert.equal(state.allowanceReady, true);
  assert.equal(state.hasAllowance, true);
  assert.equal(shouldRecordRouteUsage({ mode: 'local-development' }), false);
});

test('normal sessions still require premium and a loaded, available allowance', () => {
  assert.equal(routeGuardAccessState({ premium: false, usageReady: true, routeScansUsed: 0 }).canAccess, false);
  assert.equal(routeGuardAccessState({ premium: true, usageReady: false, routeScansUsed: 0 }).allowanceReady, false);
  assert.equal(routeGuardAccessState({ premium: true, usageReady: true, routeScansUsed: 100 }).hasAllowance, false);
  assert.equal(routeGuardAccessState({ premium: true, usageReady: true, routeScansUsed: 0 }).hasAllowance, true);
  assert.equal(shouldRecordRouteUsage({ mode: 'subscription' }), true);
});
