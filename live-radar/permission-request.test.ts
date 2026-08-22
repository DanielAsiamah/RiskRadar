import test from 'node:test';
import assert from 'node:assert/strict';

import { runPermissionRequest } from './permission-request.ts';

test('returns the refreshed permission snapshot after an OS request fails', async () => {
  const snapshot = {
    foreground: 'denied' as const,
    background: 'unknown' as const,
    notifications: 'unsupported' as const,
  };

  const result = await runPermissionRequest(
    async () => { throw new Error('OS prompt unavailable'); },
    async () => snapshot,
  );

  assert.deepEqual(result, snapshot);
});
