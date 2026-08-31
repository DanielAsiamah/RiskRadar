import { createHash } from 'node:crypto';

import { normalizeGeoJsonGeometry } from './geometry.mjs';

export const INCIDENT_SCHEMA_VERSION = 'live-incident-v1';
export const INCIDENT_POLICY_VERSION = 'live-publication-v1';
export const INCIDENT_CATEGORIES = Object.freeze([
  'flood',
  'road-collision',
  'road-closure',
  'transport-disruption',
  'fire',
  'hazardous-material',
  'severe-weather',
  'police-activity',
  'violent-incident',
  'public-safety',
  'other',
]);
export const INCIDENT_STATUSES = Object.freeze([
  'detected',
  'corroborating',
  'active',
  'updated',
  'resolving',
  'resolved',
  'retracted',
]);
export const PUBLICATION_STATES = Object.freeze([
  'published',
  'preliminary',
  'review',
  'rejected',
]);
export const VERIFICATION_LEVELS = Object.freeze([
  'Official',
  'Corroborated',
  'Preliminary',
  'Unverified',
]);
export const LOCATION_PRECISIONS = Object.freeze([
  'exact-area',
  'road-segment',
  'postcode-sector',
  'district',
  'unknown',
]);
export const SOURCE_HEALTH_STATES = Object.freeze([
  'enabled',
  'healthy',
  'stale',
  'failed',
  'disabled',
  'not-configured',
]);

const ALLOWED_TRANSITIONS = Object.freeze({
  detected: new Set(['corroborating', 'active', 'retracted']),
  corroborating: new Set(['active', 'retracted']),
  active: new Set(['updated', 'resolving', 'resolved', 'retracted']),
  updated: new Set(['updated', 'resolving', 'resolved', 'retracted']),
  resolving: new Set(['active', 'updated', 'resolved', 'retracted']),
  resolved: new Set(),
  retracted: new Set(),
});

const PUBLIC_INCIDENT_FIELDS = Object.freeze([
  'id',
  'fingerprint',
  'provider',
  'category',
  'subcategory',
  'title',
  'summary',
  'status',
  'publicationState',
  'verificationLevel',
  'confidence',
  'severity',
  'geometry',
  'centroid',
  'locationLabel',
  'locationPrecision',
  'affectedRadiusMetres',
  'firstObservedAt',
  'sourceOccurredAt',
  'lastObservedAt',
  'resolvedAt',
  'expiresAt',
  'independentSourceCount',
  'currentVersion',
  'createdAt',
  'updatedAt',
  'sourceUrl',
  'sourceUpdatedAt',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeJson(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('rawPayload numbers must be finite');
    return value;
  }
  if (!value || typeof value !== 'object') {
    throw new TypeError('rawPayload must contain only JSON values');
  }
  if (seen.has(value)) throw new TypeError('rawPayload must not contain circular references');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.map((child) => normalizeJson(child, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('rawPayload must contain only plain JSON objects');
    }
    result = {};
    for (const key of Object.keys(value).sort()) {
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value: normalizeJson(value[key], seen),
        writable: true,
      });
    }
  }
  seen.delete(value);
  return result;
}

function hashText(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function requireTrimmedString(value, field, { allowEmpty = false } = {}) {
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`);
  const trimmed = value.trim();
  if (!allowEmpty && trimmed.length === 0) throw new TypeError(`${field} must not be empty`);
  return trimmed;
}

function optionalTrimmedString(value, field) {
  if (value === null || value === undefined) return null;
  return requireTrimmedString(value, field, { allowEmpty: true });
}

function requireIsoTimestamp(value, field, { nullable = false } = {}) {
  if (nullable && (value === null || value === undefined)) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid ISO timestamp`);
  }
  return value;
}

function requireEnum(value, allowed, field) {
  if (!allowed.includes(value)) throw new TypeError(`${field} must be one of: ${allowed.join(', ')}`);
  return value;
}

function normalizeCentroid(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('centroid must contain latitude and longitude');
  }
  const { latitude, longitude } = value;
  if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RangeError('centroid latitude must be between -90 and 90');
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RangeError('centroid longitude must be between -180 and 180');
  }
  return { latitude, longitude };
}

function normalizePublicRiskConstraints(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('riskConstraints must be an object');
  }
  const maxScoreDelta = value.maxScoreDelta ?? null;
  if (maxScoreDelta !== null && (!Number.isFinite(maxScoreDelta) || typeof maxScoreDelta !== 'number')) {
    throw new TypeError('riskConstraints.maxScoreDelta must be a finite number or null');
  }
  return {
    maxScoreDelta,
    canTriggerMajorAlert: value.canTriggerMajorAlert === true,
    canTriggerRouteAvoidance: value.canTriggerRouteAvoidance === true,
  };
}

export function createSourceObservation(input, options = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('source observation input must be an object');
  }
  const provider = requireTrimmedString(input.provider, 'provider');
  const externalId = requireTrimmedString(input.externalId, 'externalId');
  if (!Number.isInteger(input.providerTier) || input.providerTier < 1 || input.providerTier > 4) {
    throw new RangeError('providerTier must be an integer from 1 to 4');
  }
  const sourceUrl = optionalTrimmedString(input.sourceUrl, 'sourceUrl');
  if (sourceUrl !== null) {
    try {
      new URL(sourceUrl);
    } catch {
      throw new TypeError('sourceUrl must be a valid URL');
    }
  }

  const rawPayload = normalizeJson(input.rawPayload);
  const payloadHash = hashText(JSON.stringify(rawPayload));
  const idHash = hashText(`${provider}\u0000${externalId}\u0000${payloadHash}`);
  const observation = {
    id: `obs_${idHash.slice(0, 32)}`,
    provider,
    providerTier: input.providerTier,
    externalId,
    sourceUrl,
    capturedAt: requireIsoTimestamp(options.capturedAt, 'capturedAt'),
    sourcePublishedAt: requireIsoTimestamp(input.sourcePublishedAt, 'sourcePublishedAt', { nullable: true }),
    sourceUpdatedAt: requireIsoTimestamp(input.sourceUpdatedAt, 'sourceUpdatedAt', { nullable: true }),
    payloadHash,
    rawPayload,
    schemaVersion: INCIDENT_SCHEMA_VERSION,
    ingestionRunId: requireTrimmedString(input.ingestionRunId, 'ingestionRunId'),
    validationState: requireTrimmedString(input.validationState, 'validationState'),
    validationErrors: Array.isArray(input.validationErrors)
      ? input.validationErrors.map((error, index) => requireTrimmedString(error, `validationErrors[${index}]`, { allowEmpty: true }))
      : (() => { throw new TypeError('validationErrors must be an array'); })(),
  };
  return deepFreeze(observation);
}

export function normalizeIncidentDraft(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('incident draft must be an object');
  }
  if (!Number.isInteger(input.severity) || input.severity < 1 || input.severity > 5) {
    throw new RangeError('severity must be an integer from 1 to 5');
  }
  if (!Number.isFinite(input.affectedRadiusMetres)
    || input.affectedRadiusMetres <= 0
    || input.affectedRadiusMetres > 100_000) {
    throw new RangeError('affectedRadiusMetres must be greater than 0 and no more than 100000');
  }
  const draft = {
    provider: requireTrimmedString(input.provider, 'provider'),
    externalId: requireTrimmedString(input.externalId, 'externalId'),
    category: requireEnum(input.category, INCIDENT_CATEGORIES, 'category'),
    subcategory: optionalTrimmedString(input.subcategory, 'subcategory'),
    title: requireTrimmedString(input.title, 'title'),
    summary: requireTrimmedString(input.summary, 'summary'),
    status: requireEnum(input.status, INCIDENT_STATUSES, 'status'),
    severity: input.severity,
    geometry: normalizeGeoJsonGeometry(input.geometry),
    centroid: normalizeCentroid(input.centroid),
    locationLabel: requireTrimmedString(input.locationLabel, 'locationLabel'),
    locationPrecision: requireEnum(input.locationPrecision, LOCATION_PRECISIONS, 'locationPrecision'),
    affectedRadiusMetres: input.affectedRadiusMetres,
    sourceOccurredAt: requireIsoTimestamp(input.sourceOccurredAt, 'sourceOccurredAt'),
    expiresAt: requireIsoTimestamp(input.expiresAt, 'expiresAt'),
  };
  return deepFreeze(draft);
}

export function assertIncidentTransition(from, to) {
  if (!(from in ALLOWED_TRANSITIONS)) throw new TypeError(`Unknown live incident status: ${String(from)}`);
  if (!(to in ALLOWED_TRANSITIONS)) throw new TypeError(`Unknown live incident status: ${String(to)}`);
  if (!ALLOWED_TRANSITIONS[from].has(to)) {
    throw new Error(`Illegal live incident transition: ${from} -> ${to}`);
  }
  return true;
}

function pickPublicIncidentFields(incident) {
  if (!incident || typeof incident !== 'object' || Array.isArray(incident)) {
    throw new TypeError('incident must be an object');
  }
  const result = {};
  for (const field of PUBLIC_INCIDENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(incident, field)) continue;
    if (field === 'geometry') {
      result.geometry = normalizeGeoJsonGeometry(incident.geometry);
    } else if (field === 'centroid') {
      result.centroid = normalizeCentroid(incident.centroid);
    } else {
      result[field] = incident[field];
    }
  }
  if (Object.prototype.hasOwnProperty.call(incident, 'riskConstraints')) {
    result.riskConstraints = normalizePublicRiskConstraints(incident.riskConstraints);
  }
  return result;
}

export function toPublicIncident(incident) {
  return deepFreeze(normalizeJson(pickPublicIncidentFields(incident)));
}

export function toPublicVersion(version) {
  if (!version || typeof version !== 'object' || Array.isArray(version)) {
    throw new TypeError('incident version must be an object');
  }
  if (!Number.isInteger(version.version) || version.version < 1) {
    throw new RangeError('version must be a positive integer');
  }
  if (!Array.isArray(version.changedFields)) throw new TypeError('changedFields must be an array');
  const result = {
    version: version.version,
    changedFields: version.changedFields.map((field, index) => requireTrimmedString(field, `changedFields[${index}]`)),
    reason: requireTrimmedString(version.reason, 'reason'),
    createdAt: requireIsoTimestamp(version.createdAt, 'createdAt'),
    snapshot: pickPublicIncidentFields(version.snapshot),
  };
  return deepFreeze(normalizeJson(result));
}
