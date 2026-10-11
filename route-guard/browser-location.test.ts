import assert from 'node:assert/strict';
import test from 'node:test';
import { watchBrowserJourneyPosition } from './browser-location.ts';
import { startJourneyLocationSession, type JourneyLocation } from './location-session.ts';

function harness() {
  let success!: PositionCallback;
  let error!: PositionErrorCallback;
  const locations: JourneyLocation[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const cleared: number[] = [];
  const geolocation = {
    watchPosition(onPosition: PositionCallback, onError: PositionErrorCallback | null | undefined) {
      success = onPosition; error = onError!; return 23;
    },
    clearWatch(id: number) { cleared.push(id); },
  };
  const stop = startJourneyLocationSession({
    subscribe: async (onLocation, onError, onWarning) => watchBrowserJourneyPosition(geolocation, onLocation, onError, onWarning),
    onLocation: (fix) => locations.push(fix),
    onError: (problem) => errors.push(problem.message),
    onWarning: (problem) => warnings.push(problem.message),
  });
  return {
    stop, locations, warnings, errors, cleared,
    fix: () => success({ coords: { latitude: 51.5, longitude: -0.1, accuracy: 10 }, timestamp: 1000 } as GeolocationPosition),
    fail: (code: number) => error({ code, message: '' } as GeolocationPositionError),
  };
}

test('browser position unavailable and timeout errors recover on the next fix without restarting', async () => {
  const h = harness();
  await new Promise((done) => setImmediate(done));
  h.fix(); h.fail(2); h.fail(3); h.fix();
  assert.equal(h.locations.length, 2);
  assert.equal(h.warnings.length, 2);
  assert.match(h.warnings[0], /paused/);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.cleared, []);
  h.stop();
  assert.deepEqual(h.cleared, [23]);
});

test('denied browser permission stops the watch and suppresses later callbacks', async () => {
  const h = harness();
  await new Promise((done) => setImmediate(done));
  h.fail(1); h.fix(); h.fail(2);
  assert.deepEqual(h.cleared, [23]);
  assert.equal(h.locations.length, 0);
  assert.equal(h.warnings.length, 0);
  assert.match(h.errors[0], /permission/);
});
