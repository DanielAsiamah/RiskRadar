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

test('late-night local pressure adds a timing adjustment', () => {
  const result = calculateCrimeScore([
    { category: 'violent-crime', count: 12 },
    { category: 'other-theft', count: 15 },
    { category: 'drugs', count: 4 },
  ], 31, {
    evaluationDate: '2026-08-19T22:30:00+01:00',
  });

  assert.equal(result.timingContext?.totalAdjustment, 2);
  assert.equal(result.timingContext?.factors[0]?.id, 'night');
  assert.match(result.timingContext?.summary ?? '', /night/i);
  assert.equal(result.score, 35);
  assert.equal(result.timingContext?.adjustedScore, 37);
});

test('weekend nightlife pressure adds a weekend adjustment', () => {
  const result = calculateCrimeScore([
    { category: 'violent-crime', count: 8 },
    { category: 'anti-social-behaviour', count: 18 },
    { category: 'drugs', count: 6 },
  ], 32, {
    evaluationDate: '2026-08-22T18:15:00+01:00',
  });

  assert.equal(result.timingContext?.totalAdjustment, 1);
  assert.equal(result.timingContext?.factors[0]?.id, 'weekend');
  assert.match(result.timingContext?.summary ?? '', /weekend/i);
  assert.equal(result.timingContext?.adjustedScore, result.score + 1);
});

test('student move-in season adds a small property-pressure adjustment', () => {
  const result = calculateCrimeScore([
    { category: 'burglary', count: 18 },
    { category: 'other-theft', count: 12 },
    { category: 'bicycle-theft', count: 4 },
  ], 34, {
    evaluationDate: '2026-09-03T14:00:00+01:00',
  });

  assert.equal(result.timingContext?.totalAdjustment, 1);
  assert.equal(result.timingContext?.factors[0]?.id, 'student-season');
  assert.match(result.timingContext?.summary ?? '', /student/i);
  assert.equal(result.timingContext?.adjustedScore, result.score + 1);
});

test('christmas retail pressure adds a theft-season adjustment', () => {
  const result = calculateCrimeScore([
    { category: 'shoplifting', count: 25 },
    { category: 'burglary', count: 14 },
    { category: 'other-theft', count: 18 },
  ], 57, {
    evaluationDate: '2026-12-11T16:00:00+00:00',
  });

  assert.equal(result.timingContext?.totalAdjustment, 2);
  assert.equal(result.timingContext?.factors[0]?.id, 'christmas');
  assert.match(result.timingContext?.summary ?? '', /christmas|festive|theft season/i);
  assert.equal(result.timingContext?.adjustedScore, result.score + 2);
});
