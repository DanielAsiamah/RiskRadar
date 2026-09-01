import { haversineDistanceMetres } from './deduplication.mjs';
import { distanceToGeometryMetres } from './geometry.mjs';

export const LIVE_RISK_POLICY_VERSION = 'live-risk-v1';

const SEVERITY_FACTORS = Object.freeze({
  1: 0.08,
  2: 0.16,
  3: 0.28,
  4: 0.45,
  5: 0.65,
});

const HALF_LIFE_MS = Object.freeze({
  flood: 120 * 60 * 1000,
  'road-collision': 90 * 60 * 1000,
  'road-closure': 180 * 60 * 1000,
  'transport-disruption': 90 * 60 * 1000,
  'severe-weather': 180 * 60 * 1000,
  default: 60 * 60 * 1000,
});

function assertScore(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${field} must be a finite number from 0 to 100`);
  }
}

function assertPoint(point, field = 'point') {
  if (!point || typeof point !== 'object' || Array.isArray(point)
    || typeof point.latitude !== 'number' || typeof point.longitude !== 'number'
    || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)
    || point.latitude < -90 || point.latitude > 90
    || point.longitude < -180 || point.longitude > 180) {
    throw new TypeError(`${field} must contain finite latitude and longitude`);
  }
}

function timestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid ISO timestamp`);
  }
  return Date.parse(value);
}

function freezeResult(result) {
  return Object.freeze({
    ...result,
    contextAdjustments: Object.freeze(result.contextAdjustments.map((item) => Object.freeze({ ...item }))),
    contributors: Object.freeze(result.contributors.map((item) => Object.freeze({ ...item }))),
  });
}

function riskLevelFor(score) {
  if (score <= 45) return 'low';
  if (score <= 75) return 'amber';
  return 'high';
}

function statusFactorFor(incident, calculatedAtMs, lastObservedAtMs) {
  if (incident.status === 'active' || incident.status === 'updated') return 1;
  if (incident.status !== 'resolving') return 0;
  const expiresAtMs = timestamp(incident.expiresAt, 'incident expiresAt');
  if (expiresAtMs <= lastObservedAtMs) return 0;
  return Math.max(0, Math.min(1, (expiresAtMs - calculatedAtMs) / (expiresAtMs - lastObservedAtMs)));
}

function scoreCapImpact(maxScoreDelta, contextScore) {
  if (maxScoreDelta === null || maxScoreDelta === undefined) return 1;
  if (typeof maxScoreDelta !== 'number' || !Number.isFinite(maxScoreDelta) || maxScoreDelta < 0) return 0;
  const availableScore = 100 - contextScore;
  return availableScore === 0 ? 0 : Math.min(1, maxScoreDelta / availableScore);
}

function contributorFor(incident, point, calculatedAtMs, contextScore) {
  if (!incident || typeof incident !== 'object' || incident.publicationState === 'review'
    || incident.publicationState === 'rejected') return null;
  if (!Number.isInteger(incident.severity) || !SEVERITY_FACTORS[incident.severity]
    || typeof incident.confidence !== 'number' || !Number.isFinite(incident.confidence)
    || incident.confidence < 0 || incident.confidence > 1
    || typeof incident.affectedRadiusMetres !== 'number' || !Number.isFinite(incident.affectedRadiusMetres)
    || incident.affectedRadiusMetres <= 0) return null;

  let distanceMetres;
  let lastObservedAtMs;
  try {
    distanceMetres = distanceToGeometryMetres(point, incident.geometry);
    lastObservedAtMs = timestamp(incident.lastObservedAt, 'incident lastObservedAt');
  } catch {
    return null;
  }
  const distanceFactor = distanceMetres >= incident.affectedRadiusMetres
    ? 0
    : (1 - distanceMetres / incident.affectedRadiusMetres) ** 2;
  const freshnessFactor = 2 ** (-Math.max(0, calculatedAtMs - lastObservedAtMs)
    / (HALF_LIFE_MS[incident.category] ?? HALF_LIFE_MS.default));
  const statusFactor = statusFactorFor(incident, calculatedAtMs, lastObservedAtMs);
  const severityFactor = SEVERITY_FACTORS[incident.severity];
  const capFactor = scoreCapImpact(incident.riskConstraints?.maxScoreDelta, contextScore);
  const rawImpact = Math.min(1, severityFactor * incident.confidence * distanceFactor * freshnessFactor * statusFactor, capFactor);
  if (rawImpact <= 0) return null;

  return {
    incidentId: incident.id,
    category: incident.category,
    verificationLevel: incident.verificationLevel,
    severity: incident.severity,
    distanceMetres: Math.round(distanceMetres),
    severityFactor,
    confidenceFactor: incident.confidence,
    distanceFactor,
    freshnessFactor,
    statusFactor,
    rawImpact,
    scoreContribution: Math.round((100 - contextScore) * rawImpact),
    sourceUpdatedAt: incident.sourceUpdatedAt,
    reason: `${incident.category} is active within its reported affected area.`,
  };
}

export function calculateLiveRisk(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('risk input must be an object');
  assertScore(input.baselineScore, 'baselineScore');
  assertScore(input.contextScore, 'contextScore');
  assertPoint(input.point);
  if (!Array.isArray(input.incidents)) throw new TypeError('incidents must be an array');
  if (!Array.isArray(input.contextAdjustments)) throw new TypeError('contextAdjustments must be an array');
  const calculatedAtMs = timestamp(input.calculatedAt, 'calculatedAt');
  const contributors = input.incidents
    .map((incident) => contributorFor(incident, input.point, calculatedAtMs, input.contextScore))
    .filter(Boolean)
    .sort((left, right) => right.rawImpact - left.rawImpact || String(left.incidentId).localeCompare(String(right.incidentId)));
  const combinedImpact = contributors.reduce((remaining, contributor) => remaining * (1 - contributor.rawImpact), 1);
  let liveScore = input.contextScore === 100
    ? 100
    : Math.round(100 - (100 - input.contextScore) * combinedImpact);
  if (contributors.length > 0 && contributors.every((item) => item.verificationLevel === 'Unverified')) {
    liveScore = Math.min(liveScore, 75);
  }
  liveScore = Math.max(input.contextScore, Math.min(100, liveScore));
  return freezeResult({
    baselineScore: input.baselineScore,
    contextScore: input.contextScore,
    contextAdjustments: input.contextAdjustments,
    liveScore,
    liveDelta: liveScore - input.contextScore,
    riskLevel: riskLevelFor(liveScore),
    contributors,
    policyVersion: LIVE_RISK_POLICY_VERSION,
    calculatedAt: input.calculatedAt,
  });
}

function segmentWeights(samples) {
  if (samples.length === 1) return [1];
  const lengths = samples.slice(0, -1).map((sample, index) => haversineDistanceMetres(sample, samples[index + 1]));
  return samples.map((_, index) => (index === 0 ? lengths[0] / 2 : index === samples.length - 1
    ? lengths[index - 1] / 2 : (lengths[index - 1] + lengths[index]) / 2));
}

export function calculateRouteLiveRisk(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('route input must be an object');
  if (!Array.isArray(input.samples) || input.samples.length < 1 || input.samples.length > 12) {
    throw new RangeError('samples must contain between 1 and 12 route points');
  }
  if (!Array.isArray(input.incidents)) throw new TypeError('incidents must be an array');
  timestamp(input.calculatedAt, 'calculatedAt');
  const samples = input.samples.map((sample, index) => {
    assertPoint(sample, `samples[${index}]`);
    return calculateLiveRisk({
      baselineScore: sample.baselineScore,
      contextScore: sample.contextScore,
      contextAdjustments: sample.contextAdjustments ?? [],
      incidents: input.incidents,
      point: sample,
      calculatedAt: input.calculatedAt,
    });
  });
  const weights = segmentWeights(input.samples);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const exposureWeightedLiveScore = Math.round(samples.reduce(
    (sum, sample, index) => sum + sample.liveScore * weights[index],
    0,
  ) / totalWeight);
  const contributingIncidentIds = [...new Set(samples.flatMap((sample) => sample.contributors.map((item) => item.incidentId)))].sort();
  return Object.freeze({
    samples: Object.freeze(samples),
    maximumLiveScore: Math.max(...samples.map((sample) => sample.liveScore)),
    exposureWeightedLiveScore,
    contributingIncidentIds: Object.freeze(contributingIncidentIds),
    policyVersion: LIVE_RISK_POLICY_VERSION,
    calculatedAt: input.calculatedAt,
  });
}
