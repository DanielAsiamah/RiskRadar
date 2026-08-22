import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createLiveRadarOperationEpoch,
  persistLiveRadarOperation,
  runLiveRadarExclusive,
} from './operation-lock.ts';

test('serializes overlapping Live Radar operations', async () => {
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });

  const first = runLiveRadarExclusive(async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:end');
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  const second = runLiveRadarExclusive(async () => {
    events.push('second:start');
    events.push('second:end');
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.deepEqual(events, ['first:start']);
  releaseFirst();
  await Promise.all([first, second]);
  assert.deepEqual(events, ['first:start', 'first:end', 'second:start', 'second:end']);
});

test('continues the queue after a failed operation', async () => {
  await assert.rejects(
    runLiveRadarExclusive(async () => { throw new Error('first failed'); }),
    /first failed/,
  );

  const result = await runLiveRadarExclusive(async () => 'second completed');
  assert.equal(result, 'second completed');
});

test('invalidates an in-flight scan immediately without waiting for the operation queue', async () => {
  const epoch = createLiveRadarOperationEpoch();
  const scanToken = epoch.capture();
  let releaseScan!: () => void;
  const scanGate = new Promise<void>((resolve) => { releaseScan = resolve; });

  const scan = runLiveRadarExclusive(async () => {
    await scanGate;
    return epoch.isCurrent(scanToken);
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  const shutdownToken = epoch.advance();
  assert.equal(epoch.isCurrent(scanToken), false);
  assert.equal(epoch.isCurrent(shutdownToken), true);

  releaseScan();
  assert.equal(await scan, false);
});

test('a shutdown invalidates a start that is still awaiting native startup', async () => {
  const epoch = createLiveRadarOperationEpoch();
  const startToken = epoch.advance();
  let releaseStart!: () => void;
  const startGate = new Promise<void>((resolve) => { releaseStart = resolve; });

  const start = runLiveRadarExclusive(async () => {
    await startGate;
    return epoch.isCurrent(startToken);
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  epoch.advance();
  releaseStart();

  assert.equal(await start, false);
});

test('repairs storage when a stale operation finishes writing after shutdown', async () => {
  const epoch = createLiveRadarOperationEpoch();
  const scanToken = epoch.capture();
  let currentState = 'enabled';
  let persistedState = 'enabled';
  let releaseStaleWrite!: () => void;
  const staleWriteGate = new Promise<void>((resolve) => { releaseStaleWrite = resolve; });

  const staleWrite = persistLiveRadarOperation({
    epoch,
    token: scanToken,
    value: 'scan-result',
    apply: (value) => { currentState = value; },
    write: async (value) => {
      if (value === 'scan-result') await staleWriteGate;
      persistedState = value;
    },
    getCurrent: () => currentState,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  epoch.advance();
  currentState = 'disabled';
  persistedState = 'disabled';
  releaseStaleWrite();

  assert.equal(await staleWrite, false);
  assert.equal(currentState, 'disabled');
  assert.equal(persistedState, 'disabled');
});
