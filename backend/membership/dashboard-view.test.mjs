import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardView, buildWatchSnapshot } from './dashboard-view.mjs';

function createAnalysis(overrides = {}) {
  return {
    postcode: 'SE10 8EP',
    crimeData: {
      month: '2026-05',
      crimeScore: 6,
      totalCrimes: 66,
      categories: [
        { category: 'violent-crime', count: 25 },
        { category: 'anti-social-behaviour', count: 16 },
        { category: 'burglary', count: 8 },
        { category: 'other-theft', count: 5 },
        { category: 'shoplifting', count: 3 },
        { category: 'drugs', count: 2 },
        { category: 'public-order', count: 2 },
        { category: 'bicycle-theft', count: 1 },
        { category: 'vehicle-crime', count: 1 },
        { category: 'robbery', count: 1 },
        { category: 'criminal-damage-arson', count: 1 },
      ],
      riskSignalDetails: [
        {
          roads: [
            { name: 'On or near Blackheath Hill', count: 8 },
            { name: 'On or near Lewisham Road', count: 4 },
          ],
          evidence: [
            { persistentId: 'crime-1' },
          ],
        },
      ],
    },
    trendData: {
      monthly: [
        { month: '2026-02', totalCrimes: 70 },
        { month: '2026-03', totalCrimes: 68 },
        { month: '2026-04', totalCrimes: 67 },
        { month: '2026-05', totalCrimes: 66 },
      ],
    },
    hotspotData: {
      clusters: [
        {
          roads: [
            { name: 'On or near Blackheath Hill', count: 2 },
            { name: 'On or near Greenwich High Road', count: 1 },
          ],
          evidence: [
            { persistentId: 'crime-2' },
          ],
        },
      ],
    },
    ...overrides,
  };
}

test('buildWatchSnapshot strips raw evidence details and caps stored lists', () => {
  const snapshot = buildWatchSnapshot(createAnalysis(), '2026-08-12T10:00:00.000Z');

  assert.deepEqual(snapshot.categories[0], { category: 'violent-crime', count: 25 });
  assert.equal(snapshot.categories.length, 10);
  assert.deepEqual(snapshot.topRoads[0], { name: 'On or near Blackheath Hill', count: 10 });
  assert.equal(snapshot.trend.length, 4);
  assert.equal(snapshot.generatedAt, '2026-08-12T10:00:00.000Z');
  assert.equal(JSON.stringify(snapshot).includes('persistentId'), false);
});

test('buildDashboardView selects the first available place and builds a monthly briefing', () => {
  const currentSnapshot = buildWatchSnapshot(createAnalysis(), '2026-08-12T10:00:00.000Z');
  const previousSnapshot = {
    ...currentSnapshot,
    totalIncidents: 80,
    categories: [
      { category: 'violent-crime', count: 20 },
      { category: 'anti-social-behaviour', count: 15 },
    ],
    trend: [
      { month: '2026-02', total: 80 },
      { month: '2026-03', total: 82 },
      { month: '2026-04', total: 81 },
    ],
  };

  const view = buildDashboardView({
    places: [
      { id: 'watch-1', label: 'Home', postcode: 'SE10 8EP' },
      { id: 'watch-2', label: 'Work', postcode: 'BR1 5NN' },
    ],
    analyses: [
      {
        watchId: 'watch-1',
        snapshot: currentSnapshot,
        previousSnapshot,
      },
      {
        watchId: 'watch-2',
        error: 'Police data unavailable.',
      },
    ],
    entitlement: {
      configured: true,
      authenticated: true,
      email: 'member@example.com',
      status: 'active',
      premium: true,
      currentPeriodEnd: '2026-09-12T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      canManageBilling: true,
    },
  });

  assert.equal(view.selectedPlace.id, 'watch-1');
  assert.equal(view.places[0].available, true);
  assert.equal(view.places[1].available, false);
  assert.match(view.briefing.headline, /home/i);
  assert.match(view.briefing.detail, /violent crime/i);
});
