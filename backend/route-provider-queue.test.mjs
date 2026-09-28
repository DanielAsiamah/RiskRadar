import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteProviderQueue } from './route-provider-queue.mjs';

test('spaces requests across concurrent route scans and recovers after a failed request', async () => {
  let time = 0;
  const starts = [];
  const queue = createRouteProviderQueue({ now: () => time, sleep: async (delay) => { time += delay; } });
  const first = queue(async () => { starts.push(time); throw new Error('upstream unavailable'); });
  const second = queue(async () => { starts.push(time); return 'route'; });
  await assert.rejects(first, /upstream unavailable/);
  assert.equal(await second, 'route');
  assert.deepEqual(starts, [0, 1100]);
});

test('bounds queued routing work and releases capacity when the active request finishes', async () => {
  let finish;
  let time = 0;
  const queue = createRouteProviderQueue({ maxPending: 1, now: () => time, sleep: async (delay) => { time += delay; } });
  const active = queue(() => new Promise((resolve) => { finish = resolve; }));
  await assert.rejects(queue(async () => 'should not run'), { code: 'ROUTE_PROVIDER_BUSY' });
  finish('first route');
  assert.equal(await active, 'first route');
  assert.equal(await queue(async () => 'next route'), 'next route');
});
