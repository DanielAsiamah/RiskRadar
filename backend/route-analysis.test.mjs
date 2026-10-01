import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoutePointAnalyzer, requireRouteCrimeRecords } from './route-analysis.mjs';

test('a stalled baseline lookup has a bounded deadline and can recover on the next check', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let stalled = true;
  const analyze = createRoutePointAnalyzer({
    loadCrimeData: async () => stalled ? new Promise(() => {}) : { crimeScore: 32 },
  });
  let failure;
  void analyze({ latitude: 51.5, longitude: -0.1 }).catch((error) => { failure = error; });
  t.mock.timers.tick(10_000);
  await new Promise(setImmediate);
  assert.match(failure?.message ?? '', /timed out/i);
  stalled = false;
  assert.equal((await analyze({ latitude: 51.5, longitude: -0.1 })).crimeData.crimeScore, 32);
});

test('route analysis retains the baseline and time context from a single crime lookup', async () => {
  const calls = [];
  const crimeData = { crimeScore: 34, timingContext: { adjustedScore: 36 }, contextLabel: 'On or near High Street' };
  const analyze = createRoutePointAnalyzer({ loadCrimeData: async (...args) => { calls.push(args); return crimeData; } });
  const result = await analyze({ latitude: 51.5, longitude: -0.1 });
  assert.deepEqual(calls, [[51.5, -0.1]]);
  assert.deepEqual(result, { crimeData });
});

test('route analysis propagates failed lookups and rejects missing baseline scores', async () => {
  const unavailable = createRoutePointAnalyzer({ loadCrimeData: async () => { throw new Error('Crime feed unavailable'); } });
  await assert.rejects(unavailable({ latitude: 51.5, longitude: -0.1 }), /Crime feed unavailable/);
  for (const crimeScore of [null, undefined, '', NaN, -1, 101]) {
    const analyze = createRoutePointAnalyzer({ loadCrimeData: async () => ({ crimeScore }) });
    await assert.rejects(analyze({ latitude: 51.5, longitude: -0.1 }), /valid baseline/i);
  }
});

test('a malformed police payload cannot become an empty low-risk dataset', () => {
  assert.deepEqual(requireRouteCrimeRecords([]), []);
  const crime = { category: 'robbery', month: '2026-05', location: { latitude: '51.5', longitude: '-0.1' } };
  assert.deepEqual(requireRouteCrimeRecords([crime]), [crime]);
  for (const payload of [null, {}, { error: 'busy' }, [null], [{}], [{ ...crime, location: null }],
    ...['', ' ', false].map((latitude) => [{ ...crime, location: { ...crime.location, latitude } }]),
  ]) {
    assert.throws(() => requireRouteCrimeRecords(payload), /unavailable or malformed/i);
  }
});
