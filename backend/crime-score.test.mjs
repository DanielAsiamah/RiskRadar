import assert from 'node:assert/strict';
import test from 'node:test';
import { blendPostcodeScore, calculateCrimeScore } from './crime-score.mjs';

test('ordinary urban crime remains well below 50', () => {
  const result = calculateCrimeScore([
    { category: 'violent-crime', count: 40 },
    { category: 'anti-social-behaviour', count: 35 },
    { category: 'vehicle-crime', count: 20 },
    { category: 'other-theft', count: 25 },
  ], 120);

  assert.equal(result.score, 6);
  assert.ok(result.score < 20);
});

test('50 robberies add exactly five category points', () => {
  const result = calculateCrimeScore([{ category: 'robbery', count: 50 }], 50);
  const robbery = result.factors.find((factor) => factor.id === 'robbery');

  assert.equal(robbery?.points, 5);
  assert.equal(result.score, 9);
});

test('an explicitly supplied homicide adds three points', () => {
  const result = calculateCrimeScore([{ category: 'homicide', count: 1 }], 1);
  const homicide = result.factors.find((factor) => factor.id === 'homicide');

  assert.equal(homicide?.points, 3);
  assert.equal(result.score, 5);
});

test('50 requires several simultaneous exceptional pressures', () => {
  const result = calculateCrimeScore([
    { category: 'homicide', count: 4 },
    { category: 'robbery', count: 150 },
    { category: 'possession-of-weapons', count: 100 },
    { category: 'violent-crime', count: 500 },
    { category: 'burglary', count: 150 },
    { category: 'anti-social-behaviour', count: 300 },
    { category: 'vehicle-crime', count: 200 },
    { category: 'drugs', count: 120 },
    { category: 'other-theft', count: 500 },
  ], 2024);

  assert.ok(result.score >= 50);
});

test('wider context can only make a small adjustment', () => {
  assert.deepEqual(blendPostcodeScore({ score: 10 }, { score: 60 }), {
    score: 13,
    localScore: 10,
    contextScore: 60,
    contextAdjustment: 3,
  });
  assert.equal(blendPostcodeScore({ score: 20 }, { score: 2 }).score, 18);
});
