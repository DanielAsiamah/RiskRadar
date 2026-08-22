import test from 'node:test';
import assert from 'node:assert/strict';

import { readCurrentLiveRadarLocation } from './location-reader.ts';

test('normalizes the current device location for a Live Radar scan', async () => {
  const result = await readCurrentLiveRadarLocation(async () => ({
    coords: {
      latitude: 51.48,
      longitude: -0.01,
      accuracy: null,
    },
  }));

  assert.deepEqual(result, {
    ok: true,
    location: {
      latitude: 51.48,
      longitude: -0.01,
      accuracyMetres: 999,
    },
  });
});

test('returns a readable warning when the OS location request fails', async () => {
  const result = await readCurrentLiveRadarLocation(async () => {
    throw new Error('Location provider unavailable');
  });

  assert.equal(result.ok, false);
  assert.match(result.warning, /location/i);
});
