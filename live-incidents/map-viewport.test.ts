import assert from 'node:assert/strict';
import test from 'node:test';

import { buildLiveMapViewport } from './map-viewport.ts';

test('a 10 km live query opens at an area-wide viewport', () => {
  const viewport = buildLiveMapViewport({ latitude: 51.5074, longitude: -0.1278 }, 10_000);

  assert.equal(viewport.webZoom, 11);
  assert.equal(viewport.latitudeDelta, 0.22);
  assert.equal(viewport.longitudeDelta, 0.36);
});

test('a street-level crime radius keeps the existing close viewport', () => {
  const viewport = buildLiveMapViewport({ latitude: 51.5074, longitude: -0.1278 }, 400);

  assert.equal(viewport.webZoom, 14);
  assert.equal(viewport.latitudeDelta, 0.025);
  assert.equal(viewport.longitudeDelta, 0.025);
});
