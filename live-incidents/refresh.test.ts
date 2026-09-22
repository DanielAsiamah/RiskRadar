import assert from 'node:assert/strict';
import test from 'node:test';

import { createLiveIncidentRefreshCoordinator } from './refresh.ts';

test('a newer live incident refresh aborts and invalidates the older request', () => {
  const coordinator = createLiveIncidentRefreshCoordinator();
  const first = coordinator.start();
  const second = coordinator.start();

  assert.equal(first.signal.aborted, true);
  assert.equal(first.isCurrent(), false);
  assert.equal(second.signal.aborted, false);
  assert.equal(second.isCurrent(), true);
});

test('cancelling live incident refresh invalidates the active request', () => {
  const coordinator = createLiveIncidentRefreshCoordinator();
  const request = coordinator.start();

  coordinator.cancel();

  assert.equal(request.signal.aborted, true);
  assert.equal(request.isCurrent(), false);
});
