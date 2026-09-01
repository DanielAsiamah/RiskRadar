import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluatePublication } from './publication-policy.mjs';

const precise = {
  locationPrecision: 'exact-area',
  locationConfidence: 1,
  severity: 4,
  contradictions: false,
  valid: true,
};

test('Tier 1 official evidence publishes automatically', () => {
  assert.deepEqual(evaluatePublication({
    ...precise,
    providerTier: 1,
    independentSourceCount: 1,
  }), {
    publicationState: 'published',
    verificationLevel: 'Official',
    confidence: 0.98,
    canAffectRisk: true,
    maxScoreDelta: null,
    canTriggerMajorAlert: true,
    canTriggerRouteAvoidance: true,
    reviewPriority: 'none',
    reasonCodes: ['tier-1-official', 'usable-location'],
    policyVersion: 'live-publication-v1',
  });
});

test('policy separates corroborated, preliminary, unverified, review, and rejected states', () => {
  const corroborated = evaluatePublication({
    ...precise,
    providerTier: 2,
    independentSourceCount: 2,
  });
  assert.equal(corroborated.publicationState, 'published');
  assert.equal(corroborated.verificationLevel, 'Corroborated');
  assert.equal(corroborated.confidence, 0.9);
  assert.equal(corroborated.canTriggerMajorAlert, true);

  const preliminary = evaluatePublication({
    ...precise,
    providerTier: 2,
    independentSourceCount: 1,
    providerAllowsPreliminary: true,
  });
  assert.equal(preliminary.publicationState, 'preliminary');
  assert.equal(preliminary.verificationLevel, 'Preliminary');
  assert.equal(preliminary.maxScoreDelta, 20);

  const unverified = evaluatePublication({
    ...precise,
    providerTier: 3,
    independentSourceCount: 1,
    allowUnverifiedMap: true,
  });
  assert.equal(unverified.publicationState, 'published');
  assert.equal(unverified.verificationLevel, 'Unverified');
  assert.equal(unverified.maxScoreDelta, 10);
  assert.equal(unverified.canTriggerMajorAlert, false);
  assert.equal(unverified.canTriggerRouteAvoidance, false);

  assert.equal(evaluatePublication({
    ...precise,
    providerTier: 4,
    independentSourceCount: 1,
  }).publicationState, 'review');

  const rejected = evaluatePublication({
    ...precise,
    providerTier: 1,
    independentSourceCount: 1,
    valid: false,
  });
  assert.equal(rejected.publicationState, 'rejected');
  assert.equal(rejected.confidence, 0);
  assert.equal(rejected.canAffectRisk, false);
});

test('contradictory and unknown-location reports stay out of route risk', () => {
  const contradictory = evaluatePublication({
    ...precise,
    providerTier: 1,
    independentSourceCount: 1,
    contradictions: true,
    severity: 5,
  });
  assert.equal(contradictory.publicationState, 'review');
  assert.equal(contradictory.reviewPriority, 'urgent');
  assert.equal(contradictory.canAffectRisk, false);

  const unknownLocation = evaluatePublication({
    ...precise,
    providerTier: 1,
    independentSourceCount: 1,
    locationPrecision: 'unknown',
  });
  assert.equal(unknownLocation.publicationState, 'review');
  assert.equal(unknownLocation.canAffectRisk, false);
  assert.equal(unknownLocation.canTriggerRouteAvoidance, false);
});

test('publication decisions are immutable and reject malformed policy input', () => {
  const decision = evaluatePublication({
    ...precise,
    providerTier: 1,
    independentSourceCount: 1,
  });
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.reasonCodes), true);
  assert.throws(() => evaluatePublication({ ...precise, providerTier: 0, independentSourceCount: 1 }), /providerTier/);
  assert.throws(() => evaluatePublication({ ...precise, providerTier: 1, independentSourceCount: -1 }), /independentSourceCount/);
  assert.throws(() => evaluatePublication({ ...precise, providerTier: 1, independentSourceCount: 1, locationConfidence: 1.1 }), /locationConfidence/);
});
