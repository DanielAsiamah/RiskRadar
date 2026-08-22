import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateLiveRadarTransition } from './evaluator.ts';
import type { LiveRadarReading, LiveRadarSettings } from './types.ts';

function createSettings(overrides: Partial<LiveRadarSettings> = {}): LiveRadarSettings {
  return {
    enabled: true,
    mode: 'native-background',
    alertsReduced: false,
    mutedPostcodes: [],
    lastAlertAt: null,
    onboardingCompleted: true,
    ...overrides,
  };
}

function createReading(overrides: Partial<LiveRadarReading> = {}): LiveRadarReading {
  return {
    checkedAt: '2026-08-22T10:00:00.000Z',
    postcode: 'SE10 8EP',
    score: 40,
    riskLevel: 'moderate',
    mainReason: 'Background local pressure is moderate.',
    dataMonth: '2026-06',
    accuracyMetres: 24,
    accuracyState: 'good',
    source: 'manual',
    ...overrides,
  };
}

test('alerts when score reaches 65 or above', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: null,
    nextReading: createReading({
      score: 66,
      riskLevel: 'high',
      mainReason: 'Violent crime is the leading local pressure.',
    }),
    settings: createSettings(),
    nowIso: '2026-08-22T10:00:00.000Z',
  });

  assert.equal(result.shouldAlert, true);
  assert.equal(result.trigger, 'score-threshold');
  assert.match(result.explanation ?? '', /65/i);
});

test('suppresses alerts during cooldown', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: createReading({
      checkedAt: '2026-08-22T09:50:00.000Z',
      score: 52,
      riskLevel: 'elevated',
      source: 'background',
    }),
    nextReading: createReading({
      checkedAt: '2026-08-22T10:00:00.000Z',
      score: 68,
      riskLevel: 'high',
      source: 'background',
      mainReason: 'Violent crime is the leading local pressure.',
    }),
    settings: createSettings({
      lastAlertAt: '2026-08-22T09:45:00.000Z',
    }),
    nowIso: '2026-08-22T10:00:00.000Z',
  });

  assert.equal(result.shouldAlert, false);
  assert.equal(result.suppressedByCooldown, true);
});

test('alerts when entering a higher risk area than the accepted previous reading', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: createReading({
      score: 43,
      riskLevel: 'moderate',
    }),
    nextReading: createReading({
      postcode: 'BR1 5NN',
      score: 56,
      riskLevel: 'elevated',
      source: 'background',
    }),
    settings: createSettings(),
    nowIso: '2026-08-22T10:30:00.000Z',
  });

  assert.equal(result.shouldAlert, true);
  assert.equal(result.trigger, 'entered-higher-risk-area');
  assert.match(result.explanation ?? '', /higher-risk area/i);
});

test('alerts on a sharp jump only when the new score is at least 50', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: createReading({
      score: 37,
      riskLevel: 'moderate',
    }),
    nextReading: createReading({
      score: 50,
      riskLevel: 'moderate',
      source: 'background',
    }),
    settings: createSettings(),
    nowIso: '2026-08-22T11:00:00.000Z',
  });

  assert.equal(result.shouldAlert, true);
  assert.equal(result.trigger, 'sharp-jump');
});

test('suppresses alerts for muted postcodes', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: null,
    nextReading: createReading({
      postcode: 'BR1 5NN',
      score: 72,
      riskLevel: 'high',
    }),
    settings: createSettings({
      mutedPostcodes: ['BR1 5NN'],
    }),
    nowIso: '2026-08-22T12:00:00.000Z',
  });

  assert.equal(result.shouldAlert, false);
  assert.equal(result.suppressedByMute, true);
});
