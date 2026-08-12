import assert from 'node:assert/strict';
import test from 'node:test';
import { compareWatchSnapshots } from './change-summary.mjs';

function createSnapshot(overrides = {}) {
  return {
    dataMonth: '2026-05',
    score: 6,
    totalIncidents: 66,
    categories: [
      { category: 'violent-crime', count: 9 },
      { category: 'anti-social-behaviour', count: 6 },
    ],
    trend: [
      { month: '2026-02', total: 90 },
      { month: '2026-03', total: 90 },
      { month: '2026-04', total: 90 },
    ],
    topRoads: [{ name: 'On or near Blackheath Hill', count: 8 }],
    generatedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  };
}

test('describes cooling volume with a rising violent-crime pattern', () => {
  const current = createSnapshot({
    totalIncidents: 80,
    categories: [
      { category: 'violent-crime', count: 12 },
      { category: 'anti-social-behaviour', count: 5 },
    ],
  });
  const previous = createSnapshot();

  const summary = compareWatchSnapshots(current, previous);

  assert.equal(summary.direction, 'cooling');
  assert.equal(summary.changePercent, -11);
  assert.equal(summary.categoryMovements[0].category, 'violent-crime');
  assert.equal(summary.categoryMovements[0].direction, 'rising');
  assert.equal(
    summary.summary,
    'Total recorded incidents fell 11% against the previous three-month average, while violent crime rose slightly.',
  );
});

test('treats small movements as stable', () => {
  const current = createSnapshot({
    totalIncidents: 71,
    categories: [
      { category: 'violent-crime', count: 9 },
      { category: 'anti-social-behaviour', count: 6 },
    ],
  });
  const previous = createSnapshot({
    trend: [
      { month: '2026-02', total: 70 },
      { month: '2026-03', total: 71 },
      { month: '2026-04', total: 72 },
    ],
  });

  const summary = compareWatchSnapshots(current, previous);

  assert.equal(summary.direction, 'stable');
  assert.equal(summary.summary, 'Recorded incident levels are broadly stable against the recent baseline.');
});

test('returns insufficient-data when there are not enough comparable months', () => {
  const summary = compareWatchSnapshots(
    createSnapshot(),
    createSnapshot({
      trend: [{ month: '2026-04', total: 90 }],
    }),
  );

  assert.equal(summary.direction, 'insufficient-data');
  assert.match(summary.summary, /not enough comparable months/i);
});

test('handles zero baselines without division errors', () => {
  const summary = compareWatchSnapshots(
    createSnapshot({
      totalIncidents: 5,
      categories: [{ category: 'robbery', count: 4 }],
    }),
    createSnapshot({
      categories: [],
      trend: [
        { month: '2026-02', total: 0 },
        { month: '2026-03', total: 0 },
        { month: '2026-04', total: 0 },
      ],
    }),
  );

  assert.equal(summary.direction, 'rising');
  assert.equal(summary.changePercent, 100);
  assert.match(summary.summary, /zero recent baseline/i);
});
