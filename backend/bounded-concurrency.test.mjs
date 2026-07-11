import assert from 'node:assert/strict';
import test from 'node:test';
import { mapSettledWithConcurrency } from './bounded-concurrency.mjs';

test('preserves input order while limiting active work', async () => {
  let active = 0;
  let maximumActive = 0;
  const results = await mapSettledWithConcurrency([30, 5, 20, 1], 2, async (delay, index) => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolve) => setTimeout(resolve, delay));
    active -= 1;
    return index;
  });

  assert.equal(maximumActive, 2);
  assert.deepEqual(results.map((result) => result.value), [0, 1, 2, 3]);
});

test('isolates a failed item and continues remaining work', async () => {
  const results = await mapSettledWithConcurrency(['ok', 'fail', 'later'], 2, async (value) => {
    if (value === 'fail') {
      throw new Error('throttled');
    }
    return value.toUpperCase();
  });

  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[2].value, 'LATER');
});
