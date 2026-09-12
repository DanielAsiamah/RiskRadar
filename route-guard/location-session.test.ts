import assert from 'node:assert/strict';
import test from 'node:test';
import { startJourneyLocationSession, type JourneyLocation } from './location-session.ts';

const fix: JourneyLocation = { latitude: 51.5, longitude: -0.1, accuracyMetres: 12, timestamp: 1000 };

test('stopping while permission is pending disposes the late subscription and ignores callbacks', async () => {
  let resolve!: (subscription: { remove(): void }) => void;
  let update!: (location: JourneyLocation) => void;
  let removed = 0;
  let delivered = 0;
  const stop = startJourneyLocationSession({
    subscribe: (onLocation) => { update = onLocation; return new Promise((done) => { resolve = done; }); },
    onLocation: () => { delivered += 1; }, onError: () => { delivered += 1; },
  });
  stop();
  update(fix);
  resolve({ remove: () => { removed += 1; } });
  await new Promise((done) => setImmediate(done));
  stop();
  assert.equal(removed, 1);
  assert.equal(delivered, 0);
});

test('delivers active fixes and removes a subscription exactly once on stop', async () => {
  let update!: (location: JourneyLocation) => void;
  let removed = 0;
  const received: JourneyLocation[] = [];
  const stop = startJourneyLocationSession({
    subscribe: async (onLocation) => { update = onLocation; return { remove: () => { removed += 1; } }; },
    onLocation: (location) => received.push(location), onError: () => assert.fail('Unexpected error'),
  });
  await new Promise((done) => setImmediate(done));
  update(fix);
  stop();
  stop();
  update(fix);
  assert.deepEqual(received, [fix]);
  assert.equal(removed, 1);
});

test('reports denied permission but suppresses errors after cancellation', async () => {
  let reject!: (error: Error) => void;
  const errors: string[] = [];
  startJourneyLocationSession({
    subscribe: async () => { throw new Error('Location permission denied'); },
    onLocation: () => {}, onError: (error) => errors.push(error.message),
  });
  const stop = startJourneyLocationSession({
    subscribe: () => new Promise((_, fail) => { reject = fail; }),
    onLocation: () => {}, onError: (error) => errors.push(error.message),
  });
  stop();
  reject(new Error('Late error'));
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(errors, ['Location permission denied']);
});
