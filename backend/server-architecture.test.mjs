import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createConfiguredLiveAdapters,
  startLiveIngestionPolling,
} from './live-incidents/runtime.mjs';
import {
  createLiveSourceDefinitions,
} from './live-incidents/sources.mjs';

test('TfL remains not configured without a server key and activates with a trimmed key', () => {
  const withoutKey = createLiveSourceDefinitions({});
  const disabledTfL = withoutKey.find((source) => source.id === 'tfl-disruptions-london');
  assert.equal(disabledTfL.defaultState, 'not-configured');
  assert.match(disabledTfL.disclosure, /need a configured provider key/i);
  assert.deepEqual(createConfiguredLiveAdapters({}).map((adapter) => adapter.id), [
    'environment-agency-floods-england',
  ]);

  const key = '  private-tfl-key  ';
  const withKey = createLiveSourceDefinitions({ TFL_APP_KEY: key });
  const enabledTfL = withKey.find((source) => source.id === 'tfl-disruptions-london');
  assert.equal(enabledTfL.defaultState, 'enabled');
  assert.equal(enabledTfL.pollIntervalMs, 5 * 60 * 1000);
  assert.match(enabledTfL.disclosure, /official TfL/i);
  assert.equal(JSON.stringify(withKey).includes('private-tfl-key'), false);
  assert.deepEqual(createConfiguredLiveAdapters({ TFL_APP_KEY: key }).map((adapter) => adapter.id), [
    'environment-agency-floods-england',
    'tfl-disruptions-london',
  ]);
});

test('live polling starts and independently schedules every configured adapter', async () => {
  const runs = [];
  const intervals = [];
  const cleared = [];
  const adapters = [
    { id: 'source-a', pollIntervalMs: 60_000 },
    { id: 'source-b', pollIntervalMs: 300_000 },
  ];
  const stop = startLiveIngestionPolling({
    adapters,
    ingestionService: {
      async run(request) {
        runs.push(request);
        return { sourceId: request.sourceId, status: 'success' };
      },
    },
    logger: { info() {}, warn() {} },
    setIntervalImpl(callback, delay) {
      const timer = { callback, delay, unrefCalled: false, unref() { this.unrefCalled = true; } };
      intervals.push(timer);
      return timer;
    },
    clearIntervalImpl(timer) {
      cleared.push(timer);
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(runs.map((request) => request.sourceId), ['source-a', 'source-b']);
  assert.deepEqual(intervals.map((timer) => timer.delay), [60_000, 300_000]);
  assert.equal(intervals.every((timer) => timer.unrefCalled), true);

  await intervals[1].callback();
  assert.equal(runs.at(-1).sourceId, 'source-b');
  stop();
  assert.deepEqual(cleared, intervals);
});

test('one failed source poll does not stop the other source timers', async () => {
  const warnings = [];
  const adapters = [
    { id: 'failing', pollIntervalMs: 60_000 },
    { id: 'healthy', pollIntervalMs: 60_000 },
  ];
  startLiveIngestionPolling({
    adapters,
    ingestionService: {
      async run({ sourceId }) {
        if (sourceId === 'failing') throw new Error('upstream unavailable');
        return { sourceId, status: 'success' };
      },
    },
    logger: { info() {}, warn(message, metadata) { warnings.push({ message, metadata }); } },
    setIntervalImpl() { return { unref() {} }; },
    clearIntervalImpl() {},
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].metadata.sourceId, 'failing');
});
