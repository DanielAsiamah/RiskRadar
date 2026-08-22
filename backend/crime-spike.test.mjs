import assert from 'node:assert/strict';
import test from 'node:test';

import { detectRecentCrimeSpike } from './crime-spike.mjs';

function month(month, totalCrimes, violentCrimes, antiSocialCrimes, robberyCrimes, dataAvailable = true) {
  return {
    month,
    monthDisplay: month,
    totalCrimes,
    violentCrimes,
    antiSocialCrimes,
    robberyCrimes,
    dataAvailable,
  };
}

test('detects a meaningful total-crime spike against the previous three usable months', () => {
  const result = detectRecentCrimeSpike([
    month('2026-02', 100, 20, 18, 4),
    month('2026-03', 95, 19, 17, 5),
    month('2026-04', 105, 21, 19, 4),
    month('2026-05', 140, 24, 20, 5),
  ]);

  assert.equal(result.status, 'spike');
  assert.equal(result.latestMonth, '2026-05');
  assert.equal(result.baselineMonths, 3);
  assert.equal(result.total.latestCount, 140);
  assert.equal(result.total.baselineAverage, 100);
  assert.equal(result.total.delta, 40);
  assert.equal(result.total.changePercent, 40);
  assert.equal(result.total.spiking, true);
  assert.match(result.summary, /40% above/i);
});

test('does not turn a small low-volume movement into a spike', () => {
  const result = detectRecentCrimeSpike([
    month('2026-02', 2, 1, 1, 0),
    month('2026-03', 3, 1, 1, 0),
    month('2026-04', 2, 1, 1, 0),
    month('2026-05', 6, 2, 2, 1),
  ]);

  assert.equal(result.status, 'stable');
  assert.equal(result.total.spiking, false);
  assert.deepEqual(result.categorySpikes, []);
  assert.match(result.summary, /no statistically useful recent spike/i);
});

test('detects a violent-crime spike even when the overall total is stable', () => {
  const result = detectRecentCrimeSpike([
    month('2026-02', 100, 10, 30, 5),
    month('2026-03', 102, 11, 31, 4),
    month('2026-04', 98, 9, 29, 6),
    month('2026-05', 106, 18, 28, 5),
  ]);

  assert.equal(result.status, 'spike');
  assert.equal(result.total.spiking, false);
  assert.equal(result.categorySpikes.length, 1);
  assert.equal(result.categorySpikes[0]?.category, 'violent-crime');
  assert.equal(result.categorySpikes[0]?.latestCount, 18);
  assert.equal(result.categorySpikes[0]?.baselineAverage, 10);
  assert.equal(result.categorySpikes[0]?.changePercent, 80);
  assert.match(result.summary, /violent crime/i);
});

test('returns insufficient data until one latest and three baseline months are usable', () => {
  const result = detectRecentCrimeSpike([
    month('2026-02', 80, 10, 20, 2),
    month('2026-03', 82, 11, 18, 3, false),
    month('2026-04', 84, 12, 19, 2),
    month('2026-05', 90, 13, 20, 3),
  ]);

  assert.equal(result.status, 'insufficient-data');
  assert.equal(result.baselineMonths, 0);
  assert.match(result.summary, /four usable monthly snapshots/i);
});
