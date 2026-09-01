const EARTH_RADIUS_METRES = 6_371_008.8;
const TOKEN_PATTERN = /[^\p{L}\p{N}]+/gu;

export const MATCH_WINDOWS = Object.freeze({
  flood: Object.freeze({ maxDistanceMetres: 10_000, maxTimeMs: 48 * 60 * 60 * 1000 }),
  'road-collision': Object.freeze({ maxDistanceMetres: 250, maxTimeMs: 2 * 60 * 60 * 1000 }),
  'road-closure': Object.freeze({ maxDistanceMetres: 500, maxTimeMs: 12 * 60 * 60 * 1000 }),
  'transport-disruption': Object.freeze({ maxDistanceMetres: 1_000, maxTimeMs: 6 * 60 * 60 * 1000 }),
  default: Object.freeze({ maxDistanceMetres: 500, maxTimeMs: 4 * 60 * 60 * 1000 }),
});

function normalizeText(value, field) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.normalize('NFKD').toLocaleLowerCase('en-GB').replace(TOKEN_PATTERN, ' ').trim().replace(/\s+/g, ' ');
}

function tokensFor(value, field) {
  return new Set(normalizeText(value, field).split(' ').filter((token) => token.length > 2));
}

function jaccardSimilarity(left, right) {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / union.size;
}

function assertCentroid(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || typeof value.latitude !== 'number' || typeof value.longitude !== 'number'
    || !Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)
    || value.latitude < -90 || value.latitude > 90
    || value.longitude < -180 || value.longitude > 180) {
    throw new TypeError(`${field} must contain finite latitude and longitude`);
  }
  return value;
}

function timestampFor(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${field} must be a valid ISO timestamp`);
  }
  return Date.parse(value);
}

function windowFor(category) {
  return MATCH_WINDOWS[category] ?? MATCH_WINDOWS.default;
}

function sourceKeyFor(draft) {
  if (typeof draft.provider !== 'string' || draft.provider.trim().length === 0
    || typeof draft.externalId !== 'string' || draft.externalId.trim().length === 0) {
    throw new TypeError('draft provider and externalId must be non-empty strings');
  }
  return `${draft.provider.trim()}:${draft.externalId.trim()}`;
}

function validateDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    throw new TypeError('draft must be an object');
  }
  sourceKeyFor(draft);
  normalizeText(draft.category, 'draft category');
  normalizeText(draft.title, 'draft title');
  assertCentroid(draft.centroid, 'draft centroid');
  timestampFor(draft.sourceOccurredAt, 'draft sourceOccurredAt');
  if (!Number.isInteger(draft.severity) || draft.severity < 1 || draft.severity > 5) {
    throw new RangeError('draft severity must be an integer from 1 to 5');
  }
}

export function haversineDistanceMetres(left, right) {
  const start = assertCentroid(left, 'left point');
  const end = assertCentroid(right, 'right point');
  const toRadians = (value) => value * Math.PI / 180;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(start.latitude)) * Math.cos(toRadians(end.latitude))
      * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

export function buildIncidentFingerprint(draft) {
  validateDraft(draft);
  return `${normalizeText(draft.category, 'draft category')}|${normalizeText(draft.title, 'draft title')}`;
}

function noneDecision() {
  return Object.freeze({
    kind: 'none', incidentId: null, candidateIds: Object.freeze([]), distanceMetres: null,
    reasonCodes: Object.freeze(['no-compatible-candidate']),
  });
}

export function findIncidentMatch(draft, candidates) {
  validateDraft(draft);
  if (!Array.isArray(candidates)) throw new TypeError('candidates must be an array');
  const sourceKey = sourceKeyFor(draft);
  const exact = candidates.find((candidate) => Array.isArray(candidate?.sourceKeys) && candidate.sourceKeys.includes(sourceKey));
  if (exact) {
    return Object.freeze({
      kind: 'exact', incidentId: exact.id, candidateIds: Object.freeze([exact.id]), distanceMetres: 0,
      reasonCodes: Object.freeze(['same-provider-external-id']),
    });
  }

  const window = windowFor(draft.category);
  const draftTokens = tokensFor(draft.title, 'draft title');
  const draftTime = timestampFor(draft.sourceOccurredAt, 'draft sourceOccurredAt');
  const matches = [];
  for (const candidate of candidates) {
    if (!candidate || candidate.category !== draft.category) continue;
    try {
      const distanceMetres = haversineDistanceMetres(draft.centroid, candidate.centroid);
      const timeDifference = Math.abs(draftTime - timestampFor(candidate.sourceOccurredAt, 'candidate sourceOccurredAt'));
      if (distanceMetres > window.maxDistanceMetres || timeDifference > window.maxTimeMs) continue;
      const candidateTokens = tokensFor(candidate.title, 'candidate title');
      const similarity = jaccardSimilarity(draftTokens, candidateTokens);
      if (similarity < 0.45) continue;
      let overlap = 0;
      for (const token of draftTokens) if (candidateTokens.has(token)) overlap += 1;
      matches.push({ candidate, distanceMetres, timeDifference, similarity, overlap });
    } catch {
      continue;
    }
  }
  if (matches.length === 0) return noneDecision();

  matches.sort((left, right) => right.overlap - left.overlap
    || right.similarity - left.similarity
    || left.distanceMetres - right.distanceMetres
    || left.timeDifference - right.timeDifference
    || String(left.candidate.id).localeCompare(String(right.candidate.id)));
  const [top, second] = matches;
  if (draft.severity >= 4 && top.candidate.severity >= 4 && second?.candidate.severity >= 4
    && Math.abs(top.similarity - second.similarity) <= 0.05) {
    return Object.freeze({
      kind: 'ambiguous', incidentId: null, candidateIds: Object.freeze([top.candidate.id, second.candidate.id]),
      distanceMetres: top.distanceMetres, reasonCodes: Object.freeze(['multiple-high-severity-candidates']),
    });
  }
  return Object.freeze({
    kind: 'candidate', incidentId: top.candidate.id, candidateIds: Object.freeze([top.candidate.id]),
    distanceMetres: top.distanceMetres,
    reasonCodes: Object.freeze(['same-category', 'within-time-window', 'within-distance-window', 'title-overlap']),
  });
}
