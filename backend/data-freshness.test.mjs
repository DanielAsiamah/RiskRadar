import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDataFreshness, findLatestAdvertisedMonth } from './data-freshness.mjs';

test('rates the current Police.uk release highly despite the normal publication lag', () => {
  const freshness = buildDataFreshness({
    dataMonth: '2026-05',
    latestAvailableMonth: '2026-05',
    checkedAt: '2026-08-22T12:00:00.000Z',
  });

  assert.equal(freshness.confidence, 'high');
  assert.equal(freshness.status, 'current-release');
  assert.equal(freshness.publicationLagMonths, 3);
  assert.equal(freshness.sourceLagMonths, 0);
  assert.match(freshness.summary, /latest available Police\.uk release/i);
});

test('marks an analysed month behind the source release as medium confidence', () => {
  const freshness = buildDataFreshness({
    dataMonth: '2026-04',
    latestAvailableMonth: '2026-05',
    checkedAt: '2026-08-22T12:00:00.000Z',
  });

  assert.equal(freshness.confidence, 'medium');
  assert.equal(freshness.status, 'behind-source');
  assert.equal(freshness.sourceLagMonths, 1);
  assert.match(freshness.warning, /one published month behind/i);
});

test('rates data several source releases behind as low confidence', () => {
  const freshness = buildDataFreshness({
    dataMonth: '2026-01',
    latestAvailableMonth: '2026-05',
    checkedAt: '2026-08-22T12:00:00.000Z',
  });

  assert.equal(freshness.confidence, 'low');
  assert.equal(freshness.status, 'stale');
  assert.equal(freshness.sourceLagMonths, 4);
  assert.match(freshness.warning, /four published months behind/i);
});

test('does not claim freshness confidence for missing or malformed months', () => {
  for (const dataMonth of ['', 'May 2026', '2026-13']) {
    const freshness = buildDataFreshness({
      dataMonth,
      latestAvailableMonth: '2026-05',
      checkedAt: '2026-08-22T12:00:00.000Z',
    });

    assert.equal(freshness.confidence, 'unavailable');
    assert.equal(freshness.status, 'unavailable');
    assert.equal(freshness.publicationLagMonths, null);
    assert.equal(freshness.sourceLagMonths, null);
  }
});

test('does not produce numeric freshness claims from an invalid check timestamp', () => {
  const freshness = buildDataFreshness({
    dataMonth: '2026-05',
    latestAvailableMonth: '2026-05',
    checkedAt: 'not-a-date',
  });

  assert.equal(freshness.confidence, 'unavailable');
  assert.equal(freshness.publicationLagMonths, null);
  assert.equal(freshness.sourceLagMonths, null);
});

test('uses the newest advertised month even when that month failed to load', () => {
  const latestMonth = findLatestAdvertisedMonth([
    { month: '2026-03', dataAvailable: true },
    { month: '2026-04', dataAvailable: true },
    { month: '2026-05', dataAvailable: false },
  ]);

  assert.equal(latestMonth, '2026-05');
});

test('returns no advertised month when release metadata is unavailable', () => {
  assert.equal(findLatestAdvertisedMonth([]), null);
  assert.equal(findLatestAdvertisedMonth(undefined), null);
});
