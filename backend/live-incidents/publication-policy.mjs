import { INCIDENT_POLICY_VERSION } from './contracts.mjs';

function freezeDecision(decision) {
  return Object.freeze({
    ...decision,
    reasonCodes: Object.freeze([...decision.reasonCodes]),
    policyVersion: INCIDENT_POLICY_VERSION,
  });
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('publication input must be an object');
  }
  if (!Number.isInteger(input.providerTier) || input.providerTier < 1 || input.providerTier > 4) {
    throw new RangeError('providerTier must be an integer from 1 to 4');
  }
  if (!Number.isInteger(input.independentSourceCount) || input.independentSourceCount < 1) {
    throw new RangeError('independentSourceCount must be a positive integer');
  }
  if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 5) {
    throw new RangeError('severity must be an integer from 1 to 5');
  }
  if (typeof input.locationConfidence !== 'number'
    || !Number.isFinite(input.locationConfidence)
    || input.locationConfidence < 0
    || input.locationConfidence > 1) {
    throw new RangeError('locationConfidence must be a number from 0 to 1');
  }
}

function noRiskDecision({ publicationState, verificationLevel, confidence, reviewPriority, reasonCodes }) {
  return freezeDecision({
    publicationState,
    verificationLevel,
    confidence,
    canAffectRisk: false,
    maxScoreDelta: 0,
    canTriggerMajorAlert: false,
    canTriggerRouteAvoidance: false,
    reviewPriority,
    reasonCodes,
  });
}

export function evaluatePublication(input) {
  validateInput(input);
  const usableLocation = input.locationPrecision !== 'unknown';

  if (input.valid === false) {
    return noRiskDecision({
      publicationState: 'rejected',
      verificationLevel: 'Unverified',
      confidence: 0,
      reviewPriority: 'none',
      reasonCodes: ['invalid-observation'],
    });
  }
  if (input.contradictions === true) {
    return noRiskDecision({
      publicationState: 'review',
      verificationLevel: 'Unverified',
      confidence: 0,
      reviewPriority: input.severity >= 4 ? 'urgent' : 'normal',
      reasonCodes: ['contradictory-evidence'],
    });
  }
  if (!usableLocation) {
    return noRiskDecision({
      publicationState: 'review',
      verificationLevel: 'Unverified',
      confidence: 0,
      reviewPriority: 'normal',
      reasonCodes: ['unknown-location'],
    });
  }
  if (input.providerTier === 1) {
    return freezeDecision({
      publicationState: 'published',
      verificationLevel: 'Official',
      confidence: 0.98,
      canAffectRisk: true,
      maxScoreDelta: null,
      canTriggerMajorAlert: true,
      canTriggerRouteAvoidance: true,
      reviewPriority: 'none',
      reasonCodes: ['tier-1-official', 'usable-location'],
    });
  }
  if (input.providerTier === 2 && input.independentSourceCount >= 2) {
    return freezeDecision({
      publicationState: 'published',
      verificationLevel: 'Corroborated',
      confidence: 0.9,
      canAffectRisk: true,
      maxScoreDelta: null,
      canTriggerMajorAlert: true,
      canTriggerRouteAvoidance: true,
      reviewPriority: 'none',
      reasonCodes: ['tier-2-corroborated', 'usable-location'],
    });
  }
  if (input.providerTier === 2 && input.providerAllowsPreliminary === true && input.locationConfidence >= 0.75) {
    return freezeDecision({
      publicationState: 'preliminary',
      verificationLevel: 'Preliminary',
      confidence: 0.72,
      canAffectRisk: true,
      maxScoreDelta: 20,
      canTriggerMajorAlert: false,
      canTriggerRouteAvoidance: false,
      reviewPriority: 'none',
      reasonCodes: ['tier-2-preliminary', 'usable-location'],
    });
  }
  if (input.providerTier === 3 && input.allowUnverifiedMap === true && input.locationConfidence >= 0.75) {
    return freezeDecision({
      publicationState: 'published',
      verificationLevel: 'Unverified',
      confidence: 0.35,
      canAffectRisk: true,
      maxScoreDelta: 10,
      canTriggerMajorAlert: false,
      canTriggerRouteAvoidance: false,
      reviewPriority: 'none',
      reasonCodes: ['tier-3-unverified-map', 'usable-location'],
    });
  }
  return noRiskDecision({
    publicationState: 'review',
    verificationLevel: 'Unverified',
    confidence: 0,
    reviewPriority: input.severity >= 4 ? 'high' : 'normal',
    reasonCodes: ['insufficient-publication-evidence'],
  });
}
