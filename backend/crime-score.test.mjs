import assert from 'node:assert/strict';
import test from 'node:test';
import { blendPostcodeScore, calculateCrimeScore } from './crime-score.mjs';

test('ordinary non-violent urban volume remains below moderate', () => {
  const result = calculateCrimeScore([
    { category: 'anti-social-behaviour', count: 35 },
    { category: 'vehicle-crime', count: 20 },
    { category: 'other-theft', count: 65 },
  ], 120);

  assert.ok(result.score >= 20);
  assert.ok(result.score < 35);
});

test('10 violent incidents establish a moderate local risk floor', () => {
  const result = calculateCrimeScore([
    { category: 'violent-crime', count: 10 },
    { category: 'other-theft', count: 4 },
  ], 14);

  assert.equal(result.score, 35);
  assert.equal(result.minimumScore, 35);
});

test('violent-crime bands escalate through elevated and high', () => {
  assert.equal(calculateCrimeScore([{ category: 'violent-crime', count: 20 }], 25).score, 50);
  assert.equal(calculateCrimeScore([{ category: 'violent-crime', count: 35 }], 45).score, 65);
  assert.equal(calculateCrimeScore([{ category: 'violent-crime', count: 60 }], 80).score, 75);
});

test('50 robberies add exactly five category points', () => {
  const result = calculateCrimeScore([{ category: 'robbery', count: 50 }], 50);
  const robbery = result.factors.find((factor) => factor.id === 'robbery');

  assert.equal(robbery?.points, 5);
  assert.equal(result.score, 20);
});

test('an explicitly supplied homicide adds three points', () => {
  const result = calculateCrimeScore([{ category: 'homicide', count: 1 }], 1);
  const homicide = result.factors.find((factor) => factor.id === 'homicide');

  assert.equal(homicide?.points, 3);
  assert.equal(result.score, 8);
});

test('several simultaneous exceptional pressures reach severe', () => {
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

  assert.ok(result.score >= 85);
});

test('wider context can only make a small adjustment', () => {
  assert.deepEqual(blendPostcodeScore({ score: 10 }, { score: 60 }), {
    score: 15,
    localScore: 10,
    contextScore: 60,
    contextAdjustment: 5,
  });
  assert.equal(blendPostcodeScore({ score: 20 }, { score: 2 }).score, 18);
});

test('wider context cannot lower a violent-crime severity floor', () => {
  const local = calculateCrimeScore([{ category: 'violent-crime', count: 10 }], 10);
  assert.equal(blendPostcodeScore(local, { score: 5 }).score, 35);
});
