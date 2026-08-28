# RiskRadar Live Safety Network Phase 2A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 2A live-incident core with one real Environment Agency flood source, transparent confidence and risk overlays, an ephemeral local store, and documented HTTP APIs that leave the existing historical RiskRadar app working when durable services are absent.

**Architecture:** Add a focused `backend/live-incidents/` module family instead of expanding the monolithic server with domain logic. Pure contract, geometry, publication, deduplication, and risk functions feed a provider-neutral ingestion service; an in-memory repository provides the same transaction boundary that Phase 2B will implement with Supabase. `backend/server.mjs` only composes the runtime and delegates HTTP requests to an injected route handler.

**Tech Stack:** Node.js 22.13+ ESM, built-in `node:test` and `node:assert/strict`, Web `fetch`/`Response` APIs, SHA-256 from `node:crypto`, Expo/React Native TypeScript content contracts, Environment Agency Flood Monitoring API.

**Spec:** `docs/superpowers/specs/2026-08-27-riskradar-live-safety-network-design.md`

## Global Constraints

- Police.uk street-level crime remains a monthly, anonymised historical baseline and must never be labelled as a live dispatch feed.
- A `LIVE` label requires an active source observation, source timestamps, a current lifecycle state, and a source-health state that is not stale.
- Every public live incident must expose provider, source link when available, first-seen time, last-updated time, confidence label, and location precision.
- Public payloads must never expose `rawPayload`, secrets, private addresses, victims, suspects, invented causes, or invented resolution details.
- Route and place wording may say `lower exposure` or `lower reported risk`; it must not promise safety.
- Source failure must be disclosed as unavailable, stale, failed, disabled, or not configured; it must never be represented as proof that no incidents exist.
- The Environment Agency adapter covers England only, polls no faster than every 15 minutes, and uses its keyless official API.
- Wales, Scotland, and Northern Ireland must each report `live flood feed not yet connected` until a verified adapter exists.
- TfL must report `not-configured` without backend credentials; National Highways must remain `disabled` until its backend subscription key is configured.
- The local memory repository is permitted only outside production and must report `durability: "ephemeral"`. Production without the Phase 2B durable store must disable live ingestion while preserving historical search.
- Internal ingestion uses a dedicated backend-only secret, constant-time comparison, existing server rate limiting, bounded request bodies, and an audit record.
- Provider URLs are fixed allow-listed Environment Agency origins with bounded redirects, response bytes, request time, retries, and concurrency.
- Deterministic tests use recorded fixtures and injected clocks/fetch implementations. The real upstream check is separate from `npm test`.
- Phase 2A parses structured official fields deterministically and introduces no AI runtime dependency.
- Public coordinate queries are processed in memory for the response and are not added to incident evidence, audit records, or location history.
- No Environment Agency, Supabase service-role, Stripe, routing, or operational secret may appear in the Expo/browser bundle.
- Existing Expo UI structure and styling are unchanged in Phase 2A; only the existing Methodology and Data Limitations content is updated.
- Read the exact Expo SDK 56 documentation before any Expo-facing implementation, while leaving the installed Expo SDK version unchanged in this phase.
- All manual edits use `apply_patch`, and unrelated user changes in the worktree remain untouched.

---

## File Map

**New domain modules**

- `backend/live-incidents/contracts.mjs`: canonical enums, validation, immutable source observations, lifecycle rules, public allow-list projection.
- `backend/live-incidents/geometry.mjs`: bounded GeoJSON normalisation, centroids, point/line/polygon distance.
- `backend/live-incidents/publication-policy.mjs`: deterministic provider-tier confidence and publication decisions.
- `backend/live-incidents/deduplication.mjs`: stable fingerprints and deterministic incident matching.
- `backend/live-incidents/risk-overlay.mjs`: point and route live-risk calculations.
- `backend/live-incidents/memory-store.mjs`: ephemeral observations, incidents, versions, outbox, cursors, source health, and audit records.
- `backend/live-incidents/sources.mjs`: declared coverage and initial source-state catalogue.
- `backend/live-incidents/adapters/environment-agency.mjs`: real England flood-warning adapter.
- `backend/live-incidents/ingestion-service.mjs`: idempotent adapter orchestration and lifecycle reconciliation.
- `backend/live-incidents/routes.mjs`: public and protected live-network HTTP routes.
- `backend/live-incidents/runtime.mjs`: environment-aware composition and production-safe fallback.
- `backend/live-incidents/source-check.mjs`: opt-in real upstream connectivity check.

**New tests and fixtures**

- `backend/live-incidents/contracts.test.mjs`
- `backend/live-incidents/publication-policy.test.mjs`
- `backend/live-incidents/deduplication.test.mjs`
- `backend/live-incidents/risk-overlay.test.mjs`
- `backend/live-incidents/memory-store.test.mjs`
- `backend/live-incidents/adapters/environment-agency.test.mjs`
- `backend/live-incidents/ingestion-service.test.mjs`
- `backend/live-incidents/routes.test.mjs`
- `backend/live-incidents/runtime.test.mjs`
- `backend/live-incidents/fixtures/environment-agency-floods.json`
- `backend/live-incidents/fixtures/environment-agency-area.json`
- `backend/live-incidents/fixtures/environment-agency-polygon.json`

**Existing integration and documentation files**

- `backend/server.mjs`
- `backend/api-catalog.mjs`
- `backend/documentation.test.mjs`
- `backend/smoke-test.mjs`
- `package.json`
- `.env.example`
- `README.md`
- `INSTALL.md`
- `backend/DEPLOYMENT.md`
- `content/methodology.ts`
- `content/limitations.ts`
- `THIRD_PARTY_NOTICES.md`

---

### Task 1: Canonical Contracts, Geometry, and Lifecycle

**Files:**
- Create: `backend/live-incidents/contracts.mjs`
- Create: `backend/live-incidents/geometry.mjs`
- Create: `backend/live-incidents/contracts.test.mjs`

**Interfaces:**
- Produces: `createSourceObservation(input, options)`, `normalizeIncidentDraft(input)`, `assertIncidentTransition(from, to)`, `toPublicIncident(incident)`, `toPublicVersion(version)`, `normalizeGeoJsonGeometry(value, options)`, `centroidForGeometry(geometry)`, and `distanceToGeometryMetres(point, geometry)`.
- Produces constants: `INCIDENT_CATEGORIES`, `INCIDENT_STATUSES`, `PUBLICATION_STATES`, `VERIFICATION_LEVELS`, `LOCATION_PRECISIONS`, `SOURCE_HEALTH_STATES`, `INCIDENT_SCHEMA_VERSION`, and `INCIDENT_POLICY_VERSION`.
- Consumes: provider-normalised source fields and GeoJSON `Point`, `LineString`, or `Polygon` values.

- [ ] **Step 1: Write failing contract and geometry tests.**

Use fixed timestamps and assert immutable/idempotent observations, legal and illegal lifecycle transitions, polygon containment, distance outside a polygon, coordinate bounds, coordinate-count limits, and public-field allow-listing:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertIncidentTransition,
  createSourceObservation,
  normalizeIncidentDraft,
  toPublicIncident,
} from './contracts.mjs';
import {
  centroidForGeometry,
  distanceToGeometryMetres,
  normalizeGeoJsonGeometry,
} from './geometry.mjs';

const capturedAt = '2026-08-27T18:00:00.000Z';
const observationInput = {
  provider: 'environment-agency',
  providerTier: 1,
  externalId: '034WAF428',
  sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
  sourcePublishedAt: '2026-08-27T16:09:22.000Z',
  sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
  rawPayload: { severityLevel: 3, description: 'Lower River Soar' },
  ingestionRunId: 'run-ea-001',
  validationState: 'valid',
  validationErrors: [],
};

test('source observations are deterministic, immutable, and retain private evidence', () => {
  const first = createSourceObservation(observationInput, { capturedAt });
  const second = createSourceObservation(observationInput, { capturedAt });
  assert.equal(first.id, second.id);
  assert.equal(first.payloadHash, second.payloadHash);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(first.rawPayload, observationInput.rawPayload);
});

test('lifecycle rejects a resolved incident becoming active', () => {
  assert.equal(assertIncidentTransition('active', 'updated'), true);
  assert.equal(assertIncidentTransition('updated', 'resolving'), true);
  assert.equal(assertIncidentTransition('resolving', 'resolved'), true);
  assert.throws(
    () => assertIncidentTransition('resolved', 'active'),
    /Illegal live incident transition/,
  );
});

test('public incidents exclude backend evidence and source-key internals', () => {
  const draft = normalizeIncidentDraft({
    provider: 'environment-agency',
    externalId: '034WAF428',
    category: 'flood',
    subcategory: 'flood-alert',
    title: 'Flood alert: Lower River Soar',
    summary: 'Flooding is possible.',
    status: 'active',
    severity: 2,
    geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] },
    centroid: { latitude: 52.79207, longitude: -1.21257 },
    locationLabel: 'Lower River Soar in Leicestershire',
    locationPrecision: 'exact-area',
    affectedRadiusMetres: 1000,
    sourceOccurredAt: '2026-08-27T16:09:22.000Z',
    expiresAt: '2026-08-27T19:00:00.000Z',
  });
  const publicIncident = toPublicIncident({
    ...draft,
    id: 'inc_123',
    fingerprint: 'fp_123',
    publicationState: 'published',
    verificationLevel: 'Official',
    confidence: 0.98,
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
    sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
    riskConstraints: {
      maxScoreDelta: null,
      canTriggerMajorAlert: true,
      canTriggerRouteAvoidance: true,
    },
    firstObservedAt: capturedAt,
    lastObservedAt: capturedAt,
    resolvedAt: null,
    primarySourceObservationId: 'obs_123',
    independentSourceCount: 1,
    currentVersion: 1,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    sourceKeys: ['environment-agency:034WAF428'],
    rawPayload: { mustNotLeak: true },
  });
  assert.equal(publicIncident.provider, 'environment-agency');
  assert.equal('rawPayload' in publicIncident, false);
  assert.equal('sourceKeys' in publicIncident, false);
});

test('geometry normalises provider strings and computes distance to an area', () => {
  const polygon = normalizeGeoJsonGeometry({
    type: 'Polygon',
    coordinates: [[
      '-1.22 52.78',
      '-1.20 52.78',
      '-1.20 52.80',
      '-1.22 52.80',
      '-1.22 52.78',
    ]],
  });
  assert.deepEqual(polygon.coordinates[0][0], [-1.22, 52.78]);
  assert.deepEqual(centroidForGeometry(polygon), {
    latitude: 52.79,
    longitude: -1.21,
  });
  assert.equal(distanceToGeometryMetres(
    { latitude: 52.79, longitude: -1.21 },
    polygon,
  ), 0);
  assert.ok(distanceToGeometryMetres(
    { latitude: 52.82, longitude: -1.21 },
    polygon,
  ) > 1000);
});
```

- [ ] **Step 2: Run the new test and verify the missing-module failure.**

Run: `node --test backend/live-incidents/contracts.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `contracts.mjs` or `geometry.mjs`.

- [ ] **Step 3: Implement the canonical constants and validators.**

Use these exact values:

```javascript
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
```

`createSourceObservation` must recursively stable-sort raw JSON before hashing with SHA-256, derive `id` from `provider + externalId + payloadHash`, validate all timestamps, deep-clone and deep-freeze the result, and never accept a caller-supplied hash or ID. `normalizeIncidentDraft` must trim factual copy, reject unknown enums, reject invalid values rather than silently changing them, and require valid geometry, centroid, severity `1..5`, positive radius no greater than `100000` metres, and ISO timestamps.

Use this lifecycle map:

```javascript
const ALLOWED_TRANSITIONS = Object.freeze({
  detected: new Set(['corroborating', 'active', 'retracted']),
  corroborating: new Set(['active', 'retracted']),
  active: new Set(['updated', 'resolving', 'resolved', 'retracted']),
  updated: new Set(['updated', 'resolving', 'resolved', 'retracted']),
  resolving: new Set(['active', 'updated', 'resolved', 'retracted']),
  resolved: new Set(),
  retracted: new Set(),
});
```

`toPublicIncident` must return only canonical public fields plus `provider`, `sourceUrl`, `sourceUpdatedAt`, and `riskConstraints: { maxScoreDelta, canTriggerMajorAlert, canTriggerRouteAvoidance }`. `toPublicVersion` must return version number, changed fields, reason, timestamp, and the already allow-listed snapshot; it must omit source-observation IDs and raw evidence.

- [ ] **Step 4: Implement bounded geometry helpers.**

`normalizeGeoJsonGeometry` must:

- accept `Point`, `LineString`, and `Polygon`;
- convert either standard coordinate arrays or Environment Agency `"longitude latitude"` strings;
- reject NaN, latitude outside `-90..90`, longitude outside `-180..180`, unclosed polygon rings, unsupported geometry types, and more than `20,000` coordinate pairs;
- return fresh arrays rather than mutating fixture objects.

`distanceToGeometryMetres` must use haversine distance for points, nearest segment distance for lines/rings, and return `0` for a point inside a polygon. Round only API output, never intermediate calculations.

- [ ] **Step 5: Run the contract tests and commit.**

Run: `node --test backend/live-incidents/contracts.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/contracts.mjs backend/live-incidents/geometry.mjs backend/live-incidents/contracts.test.mjs
git commit -m "feat: define live incident contracts"
```

---

### Task 2: Publication Policy and Deterministic Deduplication

**Files:**
- Create: `backend/live-incidents/publication-policy.mjs`
- Create: `backend/live-incidents/publication-policy.test.mjs`
- Create: `backend/live-incidents/deduplication.mjs`
- Create: `backend/live-incidents/deduplication.test.mjs`

**Interfaces:**
- Consumes: canonical provider tier, location precision, severity, source independence, and incident drafts from Task 1.
- Produces: `evaluatePublication(input) -> PublicationDecision`, `buildIncidentFingerprint(draft) -> string`, `findIncidentMatch(draft, candidates) -> MatchDecision`, and `haversineDistanceMetres(left, right) -> number`.
- `PublicationDecision` fields: `publicationState`, `verificationLevel`, `confidence`, `canAffectRisk`, `maxScoreDelta`, `canTriggerMajorAlert`, `canTriggerRouteAvoidance`, `reviewPriority`, `reasonCodes`, and `policyVersion`.
- `MatchDecision` fields: `kind` (`exact`, `candidate`, `ambiguous`, or `none`), `incidentId`, `candidateIds`, `distanceMetres`, and `reasonCodes`.

- [ ] **Step 1: Write the failing publication matrix.**

```javascript
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
  assert.equal(corroborated.verificationLevel, 'Corroborated');
  assert.equal(corroborated.canTriggerMajorAlert, true);

  const preliminary = evaluatePublication({
    ...precise,
    providerTier: 2,
    independentSourceCount: 1,
    providerAllowsPreliminary: true,
  });
  assert.equal(preliminary.publicationState, 'preliminary');
  assert.equal(preliminary.maxScoreDelta, 20);

  const unverified = evaluatePublication({
    ...precise,
    providerTier: 3,
    independentSourceCount: 1,
    allowUnverifiedMap: true,
  });
  assert.equal(unverified.verificationLevel, 'Unverified');
  assert.equal(unverified.maxScoreDelta, 10);
  assert.equal(unverified.canTriggerMajorAlert, false);
  assert.equal(unverified.canTriggerRouteAvoidance, false);

  assert.equal(evaluatePublication({
    ...precise,
    providerTier: 4,
    independentSourceCount: 1,
  }).publicationState, 'review');

  assert.equal(evaluatePublication({
    ...precise,
    providerTier: 1,
    independentSourceCount: 1,
    valid: false,
  }).publicationState, 'rejected');
});
```

- [ ] **Step 2: Write failing deduplication tests.**

Cover:

- same provider plus same external ID returns `exact`;
- same category, compatible active time, nearby geometry, and overlapping title tokens returns one `candidate`;
- distant or time-incompatible records return `none`;
- two nearly equal severity-4/5 candidates return `ambiguous` rather than a destructive merge;
- fingerprints are stable under title whitespace/case differences.

Use concrete source-lineage and candidate fixtures:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildIncidentFingerprint,
  findIncidentMatch,
} from './deduplication.mjs';

const draft = {
  provider: 'environment-agency',
  externalId: '034WAF428',
  category: 'flood',
  title: 'Flood alert: Lower River Soar',
  severity: 2,
  centroid: { latitude: 52.79207, longitude: -1.21257 },
  sourceOccurredAt: '2026-08-27T16:09:22.000Z',
};

test('same stable provider ID is an exact match', () => {
  const result = findIncidentMatch(draft, [{
    id: 'inc_existing',
    category: 'flood',
    title: 'Lower River Soar flood alert',
    severity: 2,
    centroid: { latitude: 52.792, longitude: -1.2125 },
    sourceOccurredAt: '2026-08-27T16:00:00.000Z',
    sourceKeys: ['environment-agency:034WAF428'],
  }]);
  assert.equal(result.kind, 'exact');
  assert.equal(result.incidentId, 'inc_existing');
});

test('fingerprint ignores harmless title case and spacing', () => {
  assert.equal(
    buildIncidentFingerprint(draft),
    buildIncidentFingerprint({
      ...draft,
      title: '  FLOOD ALERT: lower river soar  ',
    }),
  );
});
```

Use these category windows:

```javascript
export const MATCH_WINDOWS = Object.freeze({
  flood: { maxDistanceMetres: 10000, maxTimeMs: 48 * 60 * 60 * 1000 },
  'road-collision': { maxDistanceMetres: 250, maxTimeMs: 2 * 60 * 60 * 1000 },
  'road-closure': { maxDistanceMetres: 500, maxTimeMs: 12 * 60 * 60 * 1000 },
  'transport-disruption': { maxDistanceMetres: 1000, maxTimeMs: 6 * 60 * 60 * 1000 },
  default: { maxDistanceMetres: 500, maxTimeMs: 4 * 60 * 60 * 1000 },
});
```

- [ ] **Step 3: Run both tests and verify missing-module failures.**

Run: `node --test backend/live-incidents/publication-policy.test.mjs backend/live-incidents/deduplication.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement the explicit policy table.**

Use the following decision order:

1. `valid === false` returns `rejected / Unverified / confidence 0 / no risk`.
2. Contradictory evidence returns `review`, with urgent priority for severity `4` or `5`.
3. Unknown location returns `review` and cannot affect risk.
4. Tier 1 returns `published / Official / 0.98`.
5. Two or more independent Tier 2 sources return `published / Corroborated / 0.90`.
6. One Tier 2 source with `providerAllowsPreliminary` and location confidence at least `0.75` returns `preliminary / Preliminary / 0.72` with a 20-point cap.
7. One Tier 3 source with `allowUnverifiedMap` and location confidence at least `0.75` returns `published / Unverified / 0.35` with a 10-point cap and no major alert or route-avoidance authority.
8. Tier 4 and all remaining valid cases return `review / Unverified` with no risk impact.

Freeze every decision and preserve the ordered `reasonCodes` so API explanations are deterministic.

- [ ] **Step 5: Implement deterministic matching.**

Normalise text with Unicode NFKD, lowercase, punctuation removal, and collapsed whitespace. Use Jaccard similarity on tokens longer than two characters. Candidate eligibility requires equal category, absolute `sourceOccurredAt` difference inside the category window, and centroid/geometry distance inside the category threshold. Rank by exact road/place token overlap first, then distance, then time. A top semantic score below `0.45` returns `none`; two severity-4/5 candidates within `0.05` of the top score return `ambiguous`.

- [ ] **Step 6: Run tests and commit.**

Run: `node --test backend/live-incidents/publication-policy.test.mjs backend/live-incidents/deduplication.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/publication-policy.mjs backend/live-incidents/publication-policy.test.mjs backend/live-incidents/deduplication.mjs backend/live-incidents/deduplication.test.mjs
git commit -m "feat: add live incident confidence policy"
```

---

### Task 3: Dynamic Point and Route Risk Overlay

**Files:**
- Create: `backend/live-incidents/risk-overlay.mjs`
- Create: `backend/live-incidents/risk-overlay.test.mjs`

**Interfaces:**
- Consumes: public canonical incidents, historical `baselineScore`, transparent `contextScore`, named contextual adjustments, point coordinates, and an injected calculation time.
- Produces: `calculateLiveRisk(input) -> LiveRiskResult`, `calculateRouteLiveRisk(input) -> RouteLiveRiskResult`, and `LIVE_RISK_POLICY_VERSION = "live-risk-v1"`.
- `LiveRiskResult` fields: `baselineScore`, `contextScore`, `contextAdjustments`, `liveScore`, `liveDelta`, `riskLevel`, `contributors`, `policyVersion`, and `calculatedAt`.

- [ ] **Step 1: Write failing formula, decay, status, and cap tests.**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateLiveRisk,
  calculateRouteLiveRisk,
} from './risk-overlay.mjs';

const calculatedAt = '2026-08-27T18:00:00.000Z';
const officialFlood = {
  id: 'inc_flood_1',
  category: 'flood',
  severity: 4,
  confidence: 0.98,
  verificationLevel: 'Official',
  publicationState: 'published',
  status: 'active',
  geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] },
  affectedRadiusMetres: 2000,
  lastObservedAt: '2026-08-27T17:45:00.000Z',
  sourceUpdatedAt: '2026-08-27T17:45:00.000Z',
  expiresAt: '2026-08-27T19:00:00.000Z',
  riskConstraints: {
    maxScoreDelta: null,
    canTriggerMajorAlert: true,
    canTriggerRouteAvoidance: true,
  },
};

test('official nearby incidents layer over context without rewriting baseline', () => {
  const result = calculateLiveRisk({
    baselineScore: 34,
    contextScore: 36,
    contextAdjustments: [{ id: 'night', label: 'Late-night pressure', points: 2 }],
    incidents: [officialFlood],
    point: { latitude: 52.79207, longitude: -1.21257 },
    calculatedAt,
  });
  assert.equal(result.baselineScore, 34);
  assert.equal(result.contextScore, 36);
  assert.ok(result.liveScore > 36);
  assert.equal(result.liveDelta, result.liveScore - 36);
  assert.deepEqual(result.contributors.map((item) => item.incidentId), ['inc_flood_1']);
  assert.equal(result.policyVersion, 'live-risk-v1');
});

test('resolved and out-of-radius incidents contribute zero', () => {
  for (const incident of [
    { ...officialFlood, status: 'resolved' },
    { ...officialFlood, geometry: { type: 'Point', coordinates: [-4, 57] } },
  ]) {
    const result = calculateLiveRisk({
      baselineScore: 34,
      contextScore: 36,
      contextAdjustments: [],
      incidents: [incident],
      point: { latitude: 52.79207, longitude: -1.21257 },
      calculatedAt,
    });
    assert.equal(result.liveScore, 36);
    assert.equal(result.liveDelta, 0);
  }
});

test('unverified and preliminary evidence obey score caps', () => {
  const unverified = calculateLiveRisk({
    baselineScore: 30,
    contextScore: 30,
    contextAdjustments: [],
    incidents: [{
      ...officialFlood,
      id: 'inc_unverified',
      severity: 5,
      confidence: 1,
      verificationLevel: 'Unverified',
      riskConstraints: {
        maxScoreDelta: 10,
        canTriggerMajorAlert: false,
        canTriggerRouteAvoidance: false,
      },
    }],
    point: { latitude: 52.79207, longitude: -1.21257 },
    calculatedAt,
  });
  assert.ok(unverified.liveDelta <= 10);
  assert.notEqual(unverified.riskLevel, 'high');

  const preliminary = calculateLiveRisk({
    baselineScore: 30,
    contextScore: 30,
    contextAdjustments: [],
    incidents: [{
      ...officialFlood,
      id: 'inc_preliminary',
      severity: 5,
      confidence: 1,
      verificationLevel: 'Preliminary',
      publicationState: 'preliminary',
      riskConstraints: {
        maxScoreDelta: 20,
        canTriggerMajorAlert: false,
        canTriggerRouteAvoidance: false,
      },
    }],
    point: { latitude: 52.79207, longitude: -1.21257 },
    calculatedAt,
  });
  assert.ok(preliminary.liveDelta <= 20);
});

test('route output reports maximum and exposure-weighted live risk', () => {
  const route = calculateRouteLiveRisk({
    samples: [
      { id: 'sample-1', latitude: 52.79207, longitude: -1.21257, baselineScore: 34, contextScore: 36, contextAdjustments: [] },
      { id: 'sample-2', latitude: 52.9, longitude: -1.3, baselineScore: 20, contextScore: 20, contextAdjustments: [] },
    ],
    incidents: [officialFlood],
    calculatedAt,
  });
  assert.equal(route.samples.length, 2);
  assert.equal(route.maximumLiveScore, Math.max(...route.samples.map((item) => item.liveScore)));
  assert.ok(route.exposureWeightedLiveScore >= 0);
  assert.ok(route.exposureWeightedLiveScore <= 100);
});
```

- [ ] **Step 2: Run the risk test and verify the missing-module failure.**

Run: `node --test backend/live-incidents/risk-overlay.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the policy constants and factors.**

Use these exact factors:

```javascript
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
```

For incident `i`:

```javascript
const impact = severityFactor
  * confidence
  * distanceFactor
  * freshnessFactor
  * statusFactor;
```

- `distanceFactor = (1 - distance / affectedRadiusMetres) ** 2` inside the radius and `0` outside it.
- `freshnessFactor = 2 ** (-ageMs / halfLifeMs)` using `lastObservedAt`.
- `statusFactor` is `1` for active/updated, a linear `1..0` decline from `lastObservedAt` to `expiresAt` for resolving, and `0` for all other statuses.
- Apply each incident's `riskConstraints.maxScoreDelta` by converting the points cap into a maximum impact relative to `100 - contextScore`.
- Combine impacts with `1 - product(1 - impact)`.
- Calculate `liveScore = round(100 - (100 - contextScore) * (1 - combinedImpact))`.
- If every non-zero contributor is `Unverified`, cap `liveScore` at `75` so it cannot independently produce `high`.
- Risk levels are `low` for `0..45`, `amber` for `46..75`, and `high` for `76..100`.

Each contributor must include `incidentId`, `category`, `verificationLevel`, `severity`, `distanceMetres`, all five factors, `rawImpact`, `scoreContribution`, `sourceUpdatedAt`, and a factual reason string.

Validate `baselineScore` and `contextScore` inside `0..100`. When `contextScore === 100`, return 100 without dividing by `100 - contextScore`. With no eligible contributors, return the unchanged context score and an empty contributor list.

- [ ] **Step 4: Implement route aggregation.**

`calculateRouteLiveRisk` must accept `1..12` server-enriched samples, call `calculateLiveRisk` for each sample, return the maximum score, a score weighted by adjacent route-segment distance and rounded to an integer, unique contributing incident IDs, and `policyVersion`. A single sample has weight `1`. It does not label any route safe and does not fabricate an alternative route.

- [ ] **Step 5: Run tests and commit.**

Run: `node --test backend/live-incidents/risk-overlay.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/risk-overlay.mjs backend/live-incidents/risk-overlay.test.mjs
git commit -m "feat: calculate dynamic live risk overlays"
```

---

### Task 4: Ephemeral Incident Repository and Audit Trail

**Files:**
- Create: `backend/live-incidents/memory-store.mjs`
- Create: `backend/live-incidents/memory-store.test.mjs`

**Interfaces:**
- Consumes: observations and canonical incident snapshots from Tasks 1-3.
- Produces: `createMemoryLiveIncidentStore({ sourceDefinitions, now })`.
- Repository methods: `insertObservation`, `setObservationDecision`, `getObservation`, `findIncidentBySource`, `listMatchCandidates`, `applyIncidentMutation`, `touchIncident`, `resolveMissingSourceIncidents`, `getIncident`, `listPublicIncidents`, `listPublicVersions`, `listPublicEvidence`, `getSourceCursor`, `setSourceCursor`, `getSourceState`, `listSourceStates`, `setSourceState`, `recordAuditEvent`, `listAuditEvents`, `listOutboxEvents`, and `describeDurability`.

- [ ] **Step 1: Write failing repository contract tests.**

The tests must prove:

- the same observation ID inserts once and returns `created: false` on replay;
- returned objects are clones and cannot mutate stored state;
- creating an incident writes version 1 and one outbox event atomically;
- an unchanged heartbeat updates `lastObservedAt` without a version or outbox event;
- a material update appends exactly one immutable version and one unique outbox event;
- active Environment Agency incidents missing from a successful full snapshot resolve, while a failed or not-modified run resolves nothing;
- radius and publication filters exclude review/rejected/resolved incidents;
- source cursors, source health, and audit records are stored;
- `describeDurability()` returns the exact ephemeral disclosure.

Start the repository test file with an executable idempotency case:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSourceObservation } from './contracts.mjs';
import { createMemoryLiveIncidentStore } from './memory-store.mjs';

test('duplicate observations are inserted once and returned as clones', async () => {
  const store = createMemoryLiveIncidentStore({
    sourceDefinitions: [{
      id: 'environment-agency-floods-england',
      provider: 'environment-agency',
      defaultState: 'enabled',
      staleAfterMs: 45 * 60 * 1000,
    }],
    now: () => new Date('2026-08-27T18:00:00.000Z'),
  });
  const observation = createSourceObservation({
    provider: 'environment-agency',
    providerTier: 1,
    externalId: '034WAF428',
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
    sourcePublishedAt: '2026-08-27T16:09:22.000Z',
    sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
    rawPayload: { severityLevel: 3 },
    ingestionRunId: 'run-ea-001',
    validationState: 'valid',
    validationErrors: [],
  }, {
    capturedAt: '2026-08-27T18:00:00.000Z',
  });

  assert.equal((await store.insertObservation(observation)).created, true);
  assert.equal((await store.insertObservation(observation)).created, false);
  const firstRead = await store.getObservation(observation.id);
  firstRead.rawPayload.severityLevel = 99;
  assert.equal((await store.getObservation(observation.id)).rawPayload.severityLevel, 3);
});
```

Use this mutation shape:

```javascript
await store.applyIncidentMutation({
  observationId: 'obs_123',
  sourceKey: 'environment-agency:034WAF428',
  expectedVersion: 0,
  incident: canonicalIncident,
  changedFields: [
    'status',
    'severity',
    'summary',
    'sourceUpdatedAt',
  ],
  reason: 'official-source-created',
  policyVersion: 'live-publication-v1',
  riskPolicyVersion: 'live-risk-v1',
  at: '2026-08-27T18:00:00.000Z',
});
```

- [ ] **Step 2: Run the repository test and verify the missing-module failure.**

Run: `node --test backend/live-incidents/memory-store.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement cloned in-memory collections and indexes.**

Use Maps keyed by observation ID, incident ID, source key, cursor source ID, and outbox unique key `incidentId:version`. Store version arrays by incident ID and audit events in insertion order. `describeDurability()` must return:

```javascript
{
  driver: 'memory',
  durability: 'ephemeral',
  persistent: false,
  disclosure: 'Live incident history is stored in memory for local development and is cleared when the backend restarts.',
}
```

`applyIncidentMutation` must enforce optimistic `expectedVersion`, call `assertIncidentTransition` for updates, and commit incident/version/outbox changes only after every validation succeeds. Use deterministic IDs derived from incident ID and version for versions and outbox events.

- [ ] **Step 4: Implement public queries and source reconciliation.**

`listPublicIncidents({ point, radiusKm, limit, calculatedAt })` must:

- accept radius `0.1..50` km and limit `1..100`;
- include only `published` or `preliminary` incidents in active, updated, or resolving state;
- exclude expired incidents;
- use `distanceToGeometryMetres` and `affectedRadiusMetres` so polygon intersections count;
- sort by severity descending, then distance ascending, then update time descending;
- return allow-listed incident snapshots with `distanceMetres`.

`resolveMissingSourceIncidents` receives `fullSnapshot: true` and the seen external-ID Set. It transitions absent active/updated/resolving incidents to `resolved` only when the source run succeeded. Every resolution appends a version/outbox event with reason `provider-snapshot-removed`.

- [ ] **Step 5: Run tests and commit.**

Run: `node --test backend/live-incidents/memory-store.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/memory-store.mjs backend/live-incidents/memory-store.test.mjs
git commit -m "feat: add ephemeral live incident store"
```

---

### Task 5: Source Catalogue and Environment Agency Adapter

**Files:**
- Create: `backend/live-incidents/sources.mjs`
- Create: `backend/live-incidents/adapters/environment-agency.mjs`
- Create: `backend/live-incidents/adapters/environment-agency.test.mjs`
- Create: `backend/live-incidents/fixtures/environment-agency-floods.json`
- Create: `backend/live-incidents/fixtures/environment-agency-area.json`
- Create: `backend/live-incidents/fixtures/environment-agency-polygon.json`

**Interfaces:**
- Produces: `LIVE_SOURCE_DEFINITIONS`, `createInitialSourceStates(env, now)`, and `createEnvironmentAgencyAdapter(options)`.
- Adapter fields: `id`, `provider`, `providerTier`, `pollIntervalMs`, `coverage`, and `fetchChanges({ cursor, runId, signal })`.
- `fetchChanges` returns `{ status, fullSnapshot, records, cursor, sourceWatermark, httpStatus, latencyMs, counts }`.
- Each record contains `observationInput` and `incidentDraft` matching Task 1 signatures.

- [ ] **Step 1: Record compact official fixtures.**

Copy one current Environment Agency warning into the fixtures, retaining the official field names and replacing the long message with a short factual sentence. The flood-list fixture must include active severity `3`, the area fixture must include `lat`, `long`, `label`, `county`, `riverOrSea`, and `polygon`, and the polygon fixture must contain a closed Polygon ring using the provider's `"longitude latitude"` coordinate-string form.

The active warning fixture must be structurally equivalent to:

```json
{
  "meta": {
    "publisher": "Environment Agency",
    "licence": "http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/",
    "documentation": "http://environment.data.gov.uk/flood-monitoring/doc/reference"
  },
  "items": [
    {
      "@id": "http://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428",
      "description": "Lower River Soar in Leicestershire",
      "eaAreaName": "East Midlands",
      "floodArea": {
        "@id": "http://environment.data.gov.uk/flood-monitoring/id/floodAreas/034WAF428",
        "county": "Derbyshire, Leicestershire, Nottinghamshire",
        "notation": "034WAF428",
        "polygon": "http://environment.data.gov.uk/flood-monitoring/id/floodAreas/034WAF428/polygon",
        "riverOrSea": "River Soar"
      },
      "floodAreaID": "034WAF428",
      "isTidal": false,
      "message": "Rising river levels may lead to flooding.",
      "severity": "Flood alert",
      "severityLevel": 3,
      "timeMessageChanged": "2026-08-27T16:09:00",
      "timeRaised": "2026-08-27T16:09:22",
      "timeSeverityChanged": "2026-08-27T16:09:00"
    }
  ]
}
```

Use these exact compact area and polygon fixtures:

```json
{
  "items": {
    "@id": "http://environment.data.gov.uk/flood-monitoring/id/floodAreas/034WAF428",
    "county": "Derbyshire, Leicestershire, Nottinghamshire",
    "description": "Lower River Soar in Leicestershire including tributaries",
    "label": "Lower River Soar in Leicestershire",
    "lat": 52.79207,
    "long": -1.21257,
    "notation": "034WAF428",
    "polygon": "http://environment.data.gov.uk/flood-monitoring/id/floodAreas/034WAF428/polygon",
    "riverOrSea": "River Soar"
  }
}
```

```json
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "geometry": {
      "type": "Polygon",
      "coordinates": [[
        "-1.22 52.78",
        "-1.20 52.78",
        "-1.20 52.80",
        "-1.22 52.80",
        "-1.22 52.78"
      ]]
    },
    "properties": {
      "floodAreaID": "034WAF428"
    }
  }]
}
```

- [ ] **Step 2: Write failing source catalogue and adapter tests.**

Assert:

- Environment Agency is `enabled`, keyless, England-only, with a 15-minute interval;
- TfL is `not-configured` without `TFL_APP_KEY`;
- National Highways is `disabled`;
- Wales, Scotland, and Northern Ireland each say `live flood feed not yet connected`;
- a fixture-backed 200 response maps severity levels `1 -> 5`, `2 -> 4`, `3 -> 2`, and `4 -> resolving`;
- source timestamps and stable `floodAreaID` map correctly;
- the area and polygon responses produce official polygon geometry and `exact-area` precision;
- `If-Modified-Since` and `If-None-Match` are sent from the cursor;
- 304 returns `status: "not-modified"` and never resolves incidents;
- malformed JSON, missing IDs, unsupported severity, oversized bytes, wrong redirect origin, and timeout all fail closed;
- retryable 429/5xx responses use at most two attempts;
- title/summary copy contains only source-provided facts and whitespace is normalised.

Build the first adapter test around URL-keyed fixture responses:

```javascript
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createEnvironmentAgencyAdapter } from './environment-agency.mjs';

const fixture = async (name) => JSON.parse(await readFile(
  new URL('../fixtures/' + name, import.meta.url),
  'utf8',
));

test('normalises one official England flood alert', async () => {
  const floods = await fixture('environment-agency-floods.json');
  const area = await fixture('environment-agency-area.json');
  const polygon = await fixture('environment-agency-polygon.json');
  const responses = new Map([
    ['/flood-monitoring/id/floods', floods],
    ['/flood-monitoring/id/floodAreas/034WAF428', area],
    ['/flood-monitoring/id/floodAreas/034WAF428/polygon', polygon],
  ]);
  const adapter = createEnvironmentAgencyAdapter({
    fetchImpl: async (input) => {
      const url = new URL(input);
      return new Response(JSON.stringify(responses.get(url.pathname)), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'last-modified': 'Thu, 27 Aug 2026 17:45:00 GMT',
        },
      });
    },
    now: () => new Date('2026-08-27T18:00:00.000Z'),
    sleep: async () => {},
    random: () => 0,
  });
  const result = await adapter.fetchChanges({
    cursor: null,
    runId: 'run-ea-001',
  });
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].incidentDraft.category, 'flood');
  assert.equal(result.records[0].incidentDraft.severity, 2);
  assert.equal(result.records[0].incidentDraft.locationPrecision, 'exact-area');
});
```

- [ ] **Step 3: Run the adapter tests and verify missing-module failures.**

Run: `node --test backend/live-incidents/adapters/environment-agency.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Implement the declared source catalogue.**

Create definitions for:

```javascript
[
  {
    id: 'environment-agency-floods-england',
    provider: 'environment-agency',
    label: 'Environment Agency flood warnings',
    coverage: { countries: ['England'], regions: [], kind: 'flood' },
    defaultState: 'enabled',
  },
  {
    id: 'tfl-disruptions-london',
    provider: 'transport-for-london',
    label: 'TfL road and transport disruptions',
    coverage: { countries: ['England'], regions: ['London'], kind: 'transport' },
    defaultState: 'not-configured',
  },
  {
    id: 'national-highways-england',
    provider: 'national-highways',
    label: 'National Highways road disruptions',
    coverage: { countries: ['England'], regions: [], kind: 'road' },
    defaultState: 'disabled',
  },
  {
    id: 'flood-wales',
    provider: 'natural-resources-wales',
    label: 'Wales live flood feed',
    coverage: { countries: ['Wales'], regions: [], kind: 'flood' },
    defaultState: 'not-configured',
  },
  {
    id: 'flood-scotland',
    provider: 'sepa',
    label: 'Scotland live flood feed',
    coverage: { countries: ['Scotland'], regions: [], kind: 'flood' },
    defaultState: 'not-configured',
  },
  {
    id: 'flood-northern-ireland',
    provider: 'northern-ireland-flood-information',
    label: 'Northern Ireland live flood feed',
    coverage: { countries: ['Northern Ireland'], regions: [], kind: 'flood' },
    defaultState: 'not-configured',
  },
]
```

Every source state includes `lastAttemptAt`, `lastSuccessAt`, `sourceWatermark`, `httpStatus`, `latencyMs`, counts, `staleAfterMs`, and a human-readable disclosure. Use `45 * 60 * 1000` as the Environment Agency stale threshold.

- [ ] **Step 5: Implement bounded official-source fetching and normalisation.**

Use fixed HTTPS roots:

```javascript
const API_ORIGIN = 'https://environment.data.gov.uk';
const FLOODS_URL = API_ORIGIN + '/flood-monitoring/id/floods';
const AREA_URL_PREFIX = API_ORIGIN + '/flood-monitoring/id/floodAreas/';
```

Requirements:

- `AbortSignal.timeout(10000)` unless a stricter injected signal is already aborted.
- Maximum list/area/polygon response size `2 * 1024 * 1024` bytes each.
- Manual redirect handling with at most two redirects and hostname exactly `environment.data.gov.uk`.
- At most four concurrent area/polygon lookups.
- Cache stable area and polygon responses by flood-area ID for the life of the adapter so a 15-minute poll does not repeatedly download unchanged geometry.
- At most two attempts for timeout, 429, and 5xx; honour a bounded `Retry-After` and inject `sleep`/`random` for deterministic tests.
- Convert source `http://environment.data.gov.uk` links to HTTPS before exposing them.
- Sanitize control characters, collapse whitespace, cap title at 160 characters and summary at 600 characters without inventing missing detail.
- Use `timeRaised` as `sourcePublishedAt` and the newest valid source timestamp as `sourceUpdatedAt`.
- Use a 45-minute rolling `expiresAt` for active warnings and 24 hours for `resolving` warnings.
- Use affected radius `1000` metres outside the official polygon.
- Never emit an active incident when geometry cannot be resolved; return a valid observation with a review-only unknown-location draft.
- Preserve `{ warning, area, geometry }` inside the observation's private `rawPayload`; public projections expose only allow-listed source and geometry links.

The Environment Agency attribution string is:

```text
This uses Environment Agency flood and river level data from the real-time data API (Beta).
```

- [ ] **Step 6: Run tests and commit.**

Run: `node --test backend/live-incidents/adapters/environment-agency.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/sources.mjs backend/live-incidents/adapters/environment-agency.mjs backend/live-incidents/adapters/environment-agency.test.mjs backend/live-incidents/fixtures
git commit -m "feat: ingest Environment Agency flood warnings"
```

---

### Task 6: Idempotent Ingestion and Lifecycle Reconciliation

**Files:**
- Create: `backend/live-incidents/ingestion-service.mjs`
- Create: `backend/live-incidents/ingestion-service.test.mjs`

**Interfaces:**
- Consumes: repository, adapters, publication policy, deduplication functions, canonical builders, injected clock, logger, sleep, and random.
- Produces: `createLiveIncidentIngestionService(options)` with `run({ sourceId, requestedBy })` and `getRunningSources()`.
- Run result fields: `runId`, `sourceId`, `status`, `startedAt`, `completedAt`, `cursor`, `counts`, `durability`, and `auditId`.

- [ ] **Step 1: Write failing orchestration tests.**

Use fake adapters and the real memory repository to cover:

1. First official snapshot creates one observation, one public incident, version 1, and one outbox event.
2. Replaying the same payload is `unchanged` and creates no duplicate observation, incident, version, or outbox event.
3. Same external ID with a changed severity/message appends one version and changes incident status to `updated`.
4. Severity level 4 transitions the existing incident to `resolving`.
5. A later successful full snapshot omitting that ID transitions it to `resolved`.
6. A timeout or invalid payload sets the source to `failed` or `stale` and does not resolve any incident.
7. A 304 records a healthy attempt without reconciling absence.
8. A rejected or review-only decision stores the observation and decision but creates no public incident.
9. An ambiguous severe deduplication result records review and does not merge.
10. Two overlapping runs for the same source share one in-flight Promise and one adapter call.
11. A provider-supplied retraction transitions a non-resolved incident to `retracted`, emits one version/outbox event, and removes all risk impact.
12. A second manual run inside the adapter's 15-minute poll interval returns `status: "skipped"` without calling the provider.

Use this concrete first-run test shape:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveIncidentIngestionService } from './ingestion-service.mjs';
import { createMemoryLiveIncidentStore } from './memory-store.mjs';

const sourceDefinition = {
  id: 'environment-agency-floods-england',
  provider: 'environment-agency',
  defaultState: 'enabled',
  staleAfterMs: 45 * 60 * 1000,
};

const officialRecord = {
  observationInput: {
    provider: 'environment-agency',
    providerTier: 1,
    externalId: '034WAF428',
    sourceUrl: 'https://environment.data.gov.uk/flood-monitoring/id/floods/034WAF428',
    sourcePublishedAt: '2026-08-27T16:09:22.000Z',
    sourceUpdatedAt: '2026-08-27T16:09:00.000Z',
    rawPayload: { severityLevel: 3 },
    ingestionRunId: 'run-ea-001',
    validationState: 'valid',
    validationErrors: [],
  },
  incidentDraft: {
    provider: 'environment-agency',
    externalId: '034WAF428',
    category: 'flood',
    subcategory: 'flood-alert',
    title: 'Flood alert: Lower River Soar',
    summary: 'Flooding is possible.',
    status: 'active',
    severity: 2,
    geometry: { type: 'Point', coordinates: [-1.21257, 52.79207] },
    centroid: { latitude: 52.79207, longitude: -1.21257 },
    locationLabel: 'Lower River Soar in Leicestershire',
    locationPrecision: 'exact-area',
    affectedRadiusMetres: 1000,
    sourceOccurredAt: '2026-08-27T16:09:22.000Z',
    expiresAt: '2026-08-27T18:45:00.000Z',
  },
};

test('first official snapshot creates one versioned public incident', async () => {
  const store = createMemoryLiveIncidentStore({
    sourceDefinitions: [sourceDefinition],
    now: () => new Date('2026-08-27T18:00:00.000Z'),
  });
  const adapter = {
    ...sourceDefinition,
    providerTier: 1,
    pollIntervalMs: 15 * 60 * 1000,
    async fetchChanges() {
      return {
        status: 'success',
        fullSnapshot: true,
        records: [officialRecord],
        cursor: { sourceWatermark: '2026-08-27T16:09:00.000Z' },
        sourceWatermark: '2026-08-27T16:09:00.000Z',
        httpStatus: 200,
        latencyMs: 20,
        counts: { fetched: 1, accepted: 1, rejected: 0 },
      };
    },
  };
  const service = createLiveIncidentIngestionService({
    store,
    adapters: [adapter],
    now: () => new Date('2026-08-27T18:00:00.000Z'),
  });
  const result = await service.run({
    sourceId: sourceDefinition.id,
    requestedBy: 'test',
  });
  assert.equal(result.counts.created, 1);
  assert.equal((await store.listOutboxEvents()).length, 1);
});
```

- [ ] **Step 2: Run the service test and verify the missing-module failure.**

Run: `node --test backend/live-incidents/ingestion-service.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement one provider-neutral ingestion transaction flow.**

For each successful adapter record:

```javascript
const observation = createSourceObservation(record.observationInput, {
  capturedAt,
});
const inserted = await store.insertObservation(observation);
if (!inserted.created) {
  counts.unchanged += 1;
  continue;
}

const decision = evaluatePublication({
  providerTier: observation.providerTier,
  independentSourceCount: record.incidentDraft.independentSourceCount || 1,
  locationPrecision: record.incidentDraft.locationPrecision,
  locationConfidence: record.incidentDraft.locationPrecision === 'unknown' ? 0 : 1,
  severity: record.incidentDraft.severity,
  contradictions: false,
  valid: observation.validationState === 'valid',
});
await store.setObservationDecision(observation.id, decision);
```

Then:

- find exact source lineage before cross-source candidates;
- keep `review`/`rejected` observations private;
- create a deterministic incident ID from fingerprint for a new public incident;
- copy `provider`, `sourceUrl`, `sourceUpdatedAt`, and decision-derived `riskConstraints` into each canonical incident snapshot;
- mark a material active-to-active source update as canonical status `updated`;
- compare canonical fields and avoid versions for heartbeat-only timestamps;
- call `applyIncidentMutation` with policy versions and changed fields;
- reconcile missing IDs only after a successful, complete, non-304 snapshot;
- honour each adapter's `pollIntervalMs` before starting a network request;
- apply legal `retracted` drafts immediately, with zero public risk impact and an auditable reason;
- when a resolving, resolved, or retracted draft has no existing source lineage, retain its observation/decision but do not create an impossible public lifecycle;
- update cursor only after the entire run succeeds;
- update source state and write an audit record on both success and failure.

- [ ] **Step 4: Implement source health without false empty claims.**

Health calculation:

- `healthy` after a successful 200 or 304 within the stale threshold;
- `failed` after an error when there has never been a success;
- `stale` after an error or elapsed time beyond `staleAfterMs` when prior successful data exists;
- `enabled` before the first attempt;
- preserve `disabled` and `not-configured` declarations without polling them.

The returned failure includes a stable error code and source ID but no stack, URL query secrets, or raw provider body.

- [ ] **Step 5: Run tests and commit.**

Run: `node --test backend/live-incidents/ingestion-service.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/ingestion-service.mjs backend/live-incidents/ingestion-service.test.mjs
git commit -m "feat: orchestrate live incident ingestion"
```

---

### Task 7: Public Live APIs and Protected Ingestion Route

**Files:**
- Create: `backend/live-incidents/routes.mjs`
- Create: `backend/live-incidents/routes.test.mjs`

**Interfaces:**
- Consumes: store, ingestion service, source definitions, `analyzeLocation(query)`, `analyzePoint(payload)`, `calculateLiveRisk`, `calculateRouteLiveRisk`, a backend ingestion secret, injected clock, and optional `sendJson`.
- Produces: `createLiveIncidentRouteHandler(dependencies) -> { handle(request, response, url), getReadiness() }`.
- Handles: `GET /api/live-incidents`, `GET /api/live-incidents/:id`, `POST /api/live-risk`, `GET /api/live-source-status`, and `POST /api/internal/live-ingestion/run`.

- [ ] **Step 1: Write failing handler tests with request/response fakes.**

Test exact behavior:

- nearby list defaults to radius `10` km and limit `50`;
- invalid latitude, longitude, radius, and limit return `400 LIVE_QUERY_INVALID`;
- list output contains network state, coverage, source freshness, incidents, and disclaimer;
- detail returns allow-listed versions/evidence and `404 LIVE_INCIDENT_NOT_FOUND` for missing/private IDs;
- no response contains `rawPayload`, `sourceKeys`, ingestion secret, or operational audit details;
- postcode live-risk derives baseline/context from `analyzeLocation`;
- point and route live-risk derive their historical layers from `analyzePoint`;
- route samples are limited to `12`;
- absent or wrong ingestion secret returns `503 LIVE_INGESTION_NOT_CONFIGURED` or `401 LIVE_INGESTION_UNAUTHORISED`;
- a correct secret triggers one service run and records `requestedBy: "operator-api"`;
- invalid JSON and bodies above `8192` bytes are rejected;
- unrelated routes return `false`.

Use this postcode-analysis fixture:

```javascript
const postcodeAnalysis = {
  postcode: 'BR1 5NN',
  postcodeData: {
    latitude: 51.4062,
    longitude: 0.0186,
  },
  crimeData: {
    crimeScore: 34,
    timingContext: {
      adjustedScore: 36,
      totalAdjustment: 2,
      factors: [{
        id: 'night',
        label: 'Late-night pressure',
        points: 2,
        detail: 'Current UK timing conditions add pressure.',
      }],
    },
  },
};
```

Use executable request/response fakes for the first public-route assertion:

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveIncidentRouteHandler } from './routes.mjs';

function createRequest({ method = 'GET', body = null, headers = {} } = {}) {
  const chunks = body === null ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    headers,
    [Symbol.asyncIterator]: async function* () {
      yield* chunks;
    },
  };
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

test('nearby list returns bounded public network metadata', async () => {
  const store = {
    describeDurability: () => ({
      driver: 'memory',
      durability: 'ephemeral',
      persistent: false,
      disclosure: 'Cleared on restart.',
    }),
    listSourceStates: async () => [],
    listPublicIncidents: async () => [],
  };
  const routes = createLiveIncidentRouteHandler({
    store,
    ingestionService: { run: async () => ({ status: 'success' }) },
    sourceDefinitions: [],
    analyzeLocation: async () => postcodeAnalysis,
    analyzePoint: async () => postcodeAnalysis,
    ingestionSecret: 'test-secret-with-32-characters-123',
    now: () => new Date('2026-08-27T18:00:00.000Z'),
  });
  const response = createResponse();
  const handled = await routes.handle(
    createRequest(),
    response,
    new URL('http://localhost/api/live-incidents?lat=51.4062&lng=0.0186'),
  );
  const payload = JSON.parse(response.body);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.equal(payload.query.radiusKm, 10);
  assert.equal(payload.query.limit, 50);
  assert.equal(payload.network.durability, 'ephemeral');
});
```

- [ ] **Step 2: Run route tests and verify the missing-module failure.**

Run: `node --test backend/live-incidents/routes.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement bounded parsing and constant-time authentication.**

Read request bodies through async iteration, count Buffer bytes, and cap at `8192`. Treat an absent or shorter-than-32-character `LIVE_INGESTION_SECRET` as not configured. Accept the operational credential only from `x-live-ingestion-secret`. Compare equal-length Buffers with `crypto.timingSafeEqual`; do not reuse `ADMIN_API_KEY`.

Use stable error payloads:

```javascript
{
  error: 'Latitude, longitude, radiusKm, and limit must be within the documented live-query bounds.',
  code: 'LIVE_QUERY_INVALID',
}
```

Every route response uses `Cache-Control: no-store`. The list/detail disclaimer is:

```text
RiskRadar provides current area intelligence from named sources. It is not an emergency service and does not guarantee that a place or route is safe.
```

- [ ] **Step 4: Implement public list, detail, status, and risk contracts.**

`GET /api/live-incidents` returns:

```javascript
{
  generatedAt,
  query: { latitude, longitude, radiusKm, limit },
  network: {
    status,
    durability,
    persistent,
    disclosure,
  },
  coverage,
  sources,
  incidents,
  disclaimer,
}
```

`GET /api/live-incidents/:id` returns `incident`, allow-listed `versions`, allow-listed `evidence`, network metadata, and disclaimer.

`POST /api/live-risk` accepts exactly one mode:

```javascript
{ postcode: 'BR1 5NN' }
{ latitude: 51.4062, longitude: 0.0186 }
{
  routeSamples: [
    { id: 'sample-1', latitude: 51.4062, longitude: 0.0186 },
    { id: 'sample-2', latitude: 51.41, longitude: 0.02 }
  ]
}
```

For postcode, set `baselineScore` to `crimeData.crimeScore` and `contextScore` to `crimeData.timingContext.adjustedScore` when present. For point/route samples, call `analyzePoint` and apply the same mapping with the existing `mapSettledWithConcurrency` helper capped at two concurrent historical analyses. Return every historical/context/live layer and never accept score values from the client.

`GET /api/live-source-status` returns all declared source states, nation-by-nation flood coverage, durability disclosure, and the latest source-health calculation.

- [ ] **Step 5: Run tests and commit.**

Run: `node --test backend/live-incidents/routes.test.mjs`
Expected: PASS.

```powershell
git add -- backend/live-incidents/routes.mjs backend/live-incidents/routes.test.mjs
git commit -m "feat: expose live incident APIs"
```

---

### Task 8: Runtime Composition, Server Integration, and Honest Documentation

**Files:**
- Create: `backend/live-incidents/runtime.mjs`
- Create: `backend/live-incidents/runtime.test.mjs`
- Modify: `backend/server.mjs:1-31`
- Modify: `backend/server.mjs:100-115`
- Modify: `backend/server.mjs:4320-4410`
- Modify: `backend/api-catalog.mjs:1-78`
- Modify: `backend/documentation.test.mjs:1-90`
- Modify: `backend/smoke-test.mjs`
- Modify: `package.json:20-45`
- Modify: `.env.example:10-75`
- Modify: `README.md:1-115`
- Modify: `INSTALL.md:168-190`
- Modify: `INSTALL.md:287-430`
- Modify: `backend/DEPLOYMENT.md:50-205`
- Modify: `content/methodology.ts`
- Modify: `content/limitations.ts`
- Modify: `THIRD_PARTY_NOTICES.md`

**Interfaces:**
- Consumes: all Phase 2A modules and existing server `analyzeLocation`, `analyzePoint`, and `sendJson` functions.
- Produces: `createLiveIncidentRuntime(options)` with `store`, `ingestionService`, `routes`, `getReadiness`, and `enabled`.
- Adds machine-readable live-network diagnostics without changing historical readiness semantics.

- [ ] **Step 1: Write failing runtime safety tests.**

```javascript
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLiveIncidentRuntime } from './runtime.mjs';

test('development uses an explicitly disclosed ephemeral store', () => {
  const runtime = createLiveIncidentRuntime({
    env: {
      NODE_ENV: 'development',
      LIVE_INCIDENTS_ENABLED: 'true',
      LIVE_INGESTION_SECRET: 'test-secret-with-32-characters-123',
    },
    fetchImpl: async () => {
      throw new Error('Network is not called during composition.');
    },
  });
  assert.equal(runtime.enabled, true);
  assert.equal(runtime.store.describeDurability().durability, 'ephemeral');
});

test('production never silently falls back to memory', () => {
  const runtime = createLiveIncidentRuntime({
    env: {
      NODE_ENV: 'production',
      LIVE_INCIDENTS_ENABLED: 'true',
    },
  });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.getReadiness().status, 'not-configured');
  assert.match(runtime.getReadiness().disclosure, /durable live store/i);
});

test('explicitly disabled live network leaves historical service available', () => {
  const runtime = createLiveIncidentRuntime({
    env: {
      NODE_ENV: 'development',
      LIVE_INCIDENTS_ENABLED: 'false',
    },
  });
  assert.equal(runtime.enabled, false);
  assert.equal(runtime.getReadiness().status, 'disabled');
});
```

- [ ] **Step 2: Run runtime tests and verify the missing-module failure.**

Run: `node --test backend/live-incidents/runtime.test.mjs`
Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement runtime composition.**

Development/test behavior:

- `LIVE_INCIDENTS_ENABLED` defaults to `true`.
- Create the memory store seeded with `createInitialSourceStates`.
- Create exactly one Environment Agency adapter.
- Create the ingestion service and route handler.
- Do not perform network work during module import or runtime construction.

Production behavior:

- Return a disabled repository facade with `status: "not-configured"` and a clear durable-store disclosure.
- Public live endpoints remain callable and disclose no current live layer.
- Internal ingestion returns `503`.
- Historical `/api/analyze-*`, maps, membership fallback, and static web serving remain unaffected.

- [ ] **Step 4: Wire the delegated handler into `backend/server.mjs`.**

Add imports:

```javascript
import { createLiveIncidentRuntime } from './live-incidents/runtime.mjs';
```

Compose after existing membership/Route Guard dependencies:

```javascript
const liveIncidentRuntime = createLiveIncidentRuntime({
  env: process.env,
  analyzeLocation,
  analyzePoint,
  sendJson,
});
```

Delegate before health/docs and ordinary API branches:

```javascript
if (await liveIncidentRuntime.routes.handle(request, response, url)) {
  return;
}
```

Add `liveNetwork: liveIncidentRuntime.getReadiness()` to `/health` and `/ready` payloads. Do not add live-source problems to the root historical `ready` boolean; expose them in the nested live-network object as required by the spec.

- [ ] **Step 5: Extend API catalogue and documentation-route extraction.**

Add:

```javascript
endpoint('GET', '/api/live-incidents', 'Return current public incidents near a bounded coordinate query with source freshness and coverage.', 'Query: lat, lng, radiusKm?, limit?'),
endpoint('GET', '/api/live-incidents/:id', 'Return one public live incident with allow-listed versions and official evidence links.', 'Route: id'),
endpoint('POST', '/api/live-risk', 'Layer current incident impact over historical and transparent contextual risk for a postcode, point, or route samples.', '{ postcode } | { latitude, longitude } | { routeSamples[1..12] }'),
endpoint('GET', '/api/live-source-status', 'Return live-source coverage, health, freshness, and durability disclosures.'),
endpoint('POST', '/api/internal/live-ingestion/run', 'Run one idempotent live-source ingestion cycle using an operator credential.', '{ sourceId? }', 'operator'),
```

Update catalogue authentication copy and documentation tests to accept `operator` access. Include `backend/live-incidents/routes.mjs` in route extraction and map `/api/live-incidents/:id` from its regex. `INSTALL.md` must mention every new route so `backend/documentation.test.mjs` continues enforcing parity.

- [ ] **Step 6: Add deterministic smoke coverage and nested tests to `npm test`.**

Change `test:backend` to include:

```json
"test:backend": "node --check backend/server.mjs && node --test backend/*.test.mjs backend/live-incidents/*.test.mjs backend/live-incidents/adapters/*.test.mjs backend/membership/*.test.mjs auth/*.test.mjs membership/*.test.mjs"
```

Extend `backend/smoke-test.mjs` to verify source status, a bounded empty-or-populated live incident list, a postcode live-risk response, and unauthorised internal ingestion. The deterministic smoke path must not require an upstream Environment Agency call.

- [ ] **Step 7: Document configuration, truth boundaries, and attribution.**

Add these backend-only variables to `.env.example`:

```dotenv
# Phase 2A live safety network
LIVE_INCIDENTS_ENABLED=true
LIVE_INGESTION_SECRET=replace-me-with-at-least-32-random-characters
ENVIRONMENT_AGENCY_LIVE_ENABLED=true
ENVIRONMENT_AGENCY_TIMEOUT_MS=10000
ENVIRONMENT_AGENCY_MAX_RESPONSE_BYTES=2097152
```

Documentation must state:

- Environment Agency coverage is England-only and its warning feed updates every 15 minutes.
- Police.uk remains monthly historical context.
- memory mode is cleared by restart and is not a 24/7 production store;
- production live ingestion remains unavailable until Phase 2B durable storage is configured;
- `POST /api/internal/live-ingestion/run` is server-to-server and its secret never belongs in `EXPO_PUBLIC_*`;
- `LIVE` requires fresh official evidence;
- source outage does not mean no incidents;
- RiskRadar is informational area intelligence, not emergency dispatch or guaranteed safety;
- TfL, National Highways, Wales, Scotland, and Northern Ireland status is disclosed accurately.

Update `METHODOLOGY_LAST_UPDATED` and `LIMITATIONS_LAST_UPDATED` to `27 August 2026`. Add a live-layer section explaining `baselineScore -> contextScore -> liveScore` and a limitations section distinguishing connected, stale, failed, disabled, and not-configured sources. Add the required Environment Agency Open Government Licence attribution to `THIRD_PARTY_NOTICES.md`.

- [ ] **Step 8: Run focused integration tests and commit.**

Run:

```powershell
node --test backend/live-incidents/*.test.mjs backend/live-incidents/adapters/*.test.mjs
node --test backend/documentation.test.mjs
npm run typecheck
```

Expected: all commands PASS.

```powershell
git add -- backend/live-incidents/runtime.mjs backend/live-incidents/runtime.test.mjs backend/server.mjs backend/api-catalog.mjs backend/documentation.test.mjs backend/smoke-test.mjs package.json .env.example README.md INSTALL.md backend/DEPLOYMENT.md content/methodology.ts content/limitations.ts THIRD_PARTY_NOTICES.md
git commit -m "feat: integrate live safety network core"
```

---

### Task 9: Real Source Check, Full Verification, and Branch Push

**Files:**
- Create: `backend/live-incidents/source-check.mjs`
- Modify: `package.json:20-45`

**Interfaces:**
- Consumes: the production Environment Agency adapter and public keyless endpoint.
- Produces: `npm run api:live-source-check`, a human-readable one-shot check that does not mutate app state and never runs inside `npm test`.

- [ ] **Step 1: Add a focused real-source check command.**

`source-check.mjs` must create the Environment Agency adapter, call `fetchChanges` once with no cursor, and print dynamic values with this exact code:

```javascript
console.log('Environment Agency source reachable.');
console.log('Coverage: England');
console.log('HTTP status: ' + result.httpStatus);
console.log('Records fetched: ' + result.counts.fetched);
console.log('Source watermark: ' + (result.sourceWatermark || 'unavailable'));
console.log('No API key was used.');
```

It must exit non-zero with a concise source-status error on timeout, invalid schema, or upstream failure. It must not print raw warning messages, environment variables, headers, or stack traces.

Add:

```json
"api:live-source-check": "node --env-file-if-exists=.env backend/live-incidents/source-check.mjs"
```

- [ ] **Step 2: Run deterministic verification before the real network check.**

Run:

```powershell
npm test
npm run build:web
git diff --check
```

Expected:

- TypeScript typecheck passes.
- Live Radar tests pass.
- All backend and nested live-incident tests pass.
- build and git guards pass.
- Expo web export completes.
- bundle secret scan reports no backend credentials.
- `git diff --check` produces no output.

- [ ] **Step 3: Run the separate official-source connectivity check.**

Run: `npm run api:live-source-check`
Expected: the endpoint is reachable, coverage is England, HTTP status is 200, and record count is zero or greater. A zero count is a valid successful snapshot and must not be described as a provider failure.

- [ ] **Step 4: Run a local API smoke with the protected ingestion route.**

Terminal 1:

```powershell
$env:NODE_ENV = "development"
$env:LIVE_INGESTION_SECRET = "local-live-ingestion-secret-change-me"
npm run api
```

Terminal 2:

```powershell
Invoke-RestMethod -Method Post `
  -Uri "http://127.0.0.1:3001/api/internal/live-ingestion/run" `
  -Headers @{ "x-live-ingestion-secret" = "local-live-ingestion-secret-change-me" } `
  -ContentType "application/json" `
  -Body '{"sourceId":"environment-agency-floods-england"}'

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3001/api/live-source-status"

Invoke-RestMethod `
  -Uri "http://127.0.0.1:3001/api/live-incidents?lat=52.79207&lng=-1.21257&radiusKm=25&limit=20"
```

Expected: ingestion returns a successful run and ephemeral durability disclosure; status reports Environment Agency healthy; incident list returns zero or more allow-listed incidents and never includes `rawPayload`.

- [ ] **Step 5: Inspect the final diff and commit the operational check.**

Run:

```powershell
git status --short
git diff --stat
git diff -- backend/live-incidents/source-check.mjs package.json
```

Confirm no `.env`, `dist`, backend cache, raw source dump, or secret is staged.

```powershell
git add -- backend/live-incidents/source-check.mjs package.json
git commit -m "chore: add live source connectivity check"
```

- [ ] **Step 6: Push the completed Phase 2A commits to the Macbook branch.**

Run:

```powershell
git status --short --branch
git log --oneline -10
git push origin Macbook
git rev-parse HEAD
git rev-parse origin/Macbook
```

Expected: worktree is clean and the local and remote commit hashes match.

---

## Phase 2A Completion Gate

Do not describe Phase 2A as complete until all of these statements are evidenced by commands or tests:

- One real keyless official source is reachable through a backend-only adapter.
- Source observations are immutable and replay-idempotent.
- Canonical incidents create, update, resolve, retract, and reject only through legal transitions.
- Duplicate provider observations do not duplicate incidents, versions, or outbox events.
- Official, corroborated, preliminary, unverified, review, and rejected decisions follow the explicit policy table.
- Dynamic risk reports baseline, context, named adjustments, live score, delta, contributors, policy version, and calculation time.
- Resolving contributions decay; resolved/retracted/out-of-radius contributions are zero.
- Unverified and preliminary evidence obey their point and alert-authority caps.
- Public list/detail responses expose allow-listed evidence only.
- Failed and stale sources remain visible and never become a false empty claim.
- Non-production works with an explicitly ephemeral memory store.
- Production without durable Phase 2B storage preserves the historical app and disables live ingestion rather than silently using memory.
- Documentation and in-app trust content distinguish monthly crime history from current official incidents.
- The full deterministic suite, web export, secret guards, real-source check, local ingestion smoke, and remote-branch verification all pass.

## Explicit Phase Boundary

Phase 2A does not add the live map UI, browser polling, mobile push notifications, background incident delivery, real route recalculation, Supabase/PostGIS persistence, Realtime Broadcast, TfL ingestion, National Highways ingestion, community reports, or reviewer screens. Their contracts are preserved by the approved design and are delivered in Phases 2B-2F without weakening the Phase 2A truth and safety rules.
