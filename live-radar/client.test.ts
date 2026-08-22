import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizePostcodeAnalysisToLiveRadarReading,
  scanLiveRadarCoordinates,
} from './client.ts';
import type { PostcodeResult } from '../types.ts';

function createPostcodeResult(overrides: Partial<PostcodeResult> = {}): PostcodeResult {
  return {
    postcode: 'SE10 8EP',
    crimeData: {
      totalCrimes: 66,
      crimeScore: 66,
      safetyLevel: 'High',
      month: '2026-06',
      monthDisplay: 'June 2026',
      categories: [
        { category: 'violent-crime', count: 25 },
        { category: 'anti-social-behaviour', count: 16 },
      ],
      riskSignals: ['25 reported violent crime incidents were found in the latest street-level dataset.'],
    },
    postcodeData: {
      admin_district: 'Lewisham',
      longitude: -0.013901,
      latitude: 51.471191,
      postcode: 'SE10 8EP',
    },
    aiAnalysis: {
      summary: 'Lewisham currently scores elevated risk because violent crime is the leading local pressure.',
      whatToAvoid: [],
      safetyTips: [],
      localVibe: 'Busy urban patch',
      scoreStory: ['Violent crime is the leading local pressure.'],
      areaContext: 'Busy urban patch',
    },
    trendData: {
      monthly: [],
      direction: 'stable',
      changePercent: 0,
      categoryDirection: {
        violentCrimes: 'stable',
        antiSocialCrimes: 'stable',
        robberyCrimes: 'stable',
      },
      summary: 'Stable',
    },
    premiumInsights: [],
    newsLink: null,
    ...overrides,
  };
}

test('normalizes postcode analysis into a compact Live Radar reading', () => {
  const reading = normalizePostcodeAnalysisToLiveRadarReading(
    createPostcodeResult(),
    {
      accuracyMetres: 18,
      checkedAt: '2026-08-22T11:00:00.000Z',
      source: 'manual',
    },
  );

  assert.equal(reading.postcode, 'SE10 8EP');
  assert.equal(reading.score, 66);
  assert.equal(reading.riskLevel, 'high');
  assert.match(reading.mainReason, /violent/i);
  assert.equal(reading.dataMonth, '2026-06');
});

test('returns a suppressed warning when postcode lookup cannot resolve a nearby postcode', async () => {
  const result = await scanLiveRadarCoordinates({
    latitude: 51.48,
    longitude: -0.01,
    accuracyMetres: 22,
    checkedAtIso: '2026-08-22T11:05:00.000Z',
    source: 'manual',
    getNearbyPostcodeForCoordinates: async () => null,
    fetchLiveRadarReadingForPostcode: async () => {
      throw new Error('should not fetch when postcode resolution fails');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.suppressAlert, true);
  assert.match(result.warning ?? '', /postcode/i);
});

test('returns a suppressed warning when the analysis request fails', async () => {
  const result = await scanLiveRadarCoordinates({
    latitude: 51.48,
    longitude: -0.01,
    accuracyMetres: 160,
    checkedAtIso: '2026-08-22T11:10:00.000Z',
    source: 'background',
    getNearbyPostcodeForCoordinates: async () => 'SE10 8EP',
    fetchLiveRadarReadingForPostcode: async () => {
      throw new Error('Network timeout');
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.suppressAlert, true);
  assert.match(result.warning ?? '', /unable|timeout|network/i);
});
