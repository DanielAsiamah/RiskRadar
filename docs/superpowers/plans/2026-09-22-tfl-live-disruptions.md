# TfL Live Disruptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect official current TfL road and transport disruptions to RiskRadar's live incident network when a server-side TfL key is configured.

**Architecture:** A provider adapter fetches official TfL road and line disruption snapshots, validates and normalises mappable records into the existing canonical incident contract, and rejects malformed records independently. Runtime composition enables and polls the adapter only when `TFL_APP_KEY` exists; source status remains honestly `not-configured` otherwise, and the key never crosses the backend boundary.

**Tech Stack:** Node.js 22 ESM, built-in `fetch`, `node:test`, existing live-incident ingestion/store/API, Expo/React Native clients.

**Spec:** `docs/superpowers/specs/2026-08-27-riskradar-live-safety-network-design.md`

## Global Constraints

- TfL data is London-only and must never be described as UK-wide coverage.
- `TFL_APP_KEY` is server-side only and must never appear in public API payloads, Expo environment variables, or bundles.
- Missing credentials keep TfL in `not-configured`; production must never substitute fixtures or fake incidents.
- Provider records retain a stable TfL source identifier, official HTTPS evidence URL, source timestamps, and structured location.
- One malformed provider record must not discard other usable records from the same successful snapshot.
- The existing Environment Agency source and credential-free app startup must continue to work.

## Review Focus

- Provider URLs or redirects leaving `api.tfl.gov.uk` must be rejected to prevent key exfiltration.
- Scheduled and recently cleared roadworks must not be presented as active immediate hazards.
- Line disruptions without mappable affected stops must be rejected instead of appearing at a guessed London centroid.
- Duplicate line disruption payloads affecting several stops must produce stable source IDs and geometry.
- Poll failures must retain truthful stale/failed source state without clearing the last successful public incidents.

---

### Task 1: Official TfL Adapter

**Files:**
- Create: `backend/live-incidents/adapters/tfl.mjs`
- Create: `backend/live-incidents/adapters/tfl.test.mjs`
- Create: `backend/live-incidents/fixtures/tfl-road-disruptions.json`
- Create: `backend/live-incidents/fixtures/tfl-line-disruptions.json`

**Interfaces:**
- Consumes: `fetchImpl(input, init)`, `TFL_APP_KEY`, canonical `{ observationInput, incidentDraft }` records accepted by `createLiveIncidentIngestionService`.
- Produces: `createTflAdapter({ appKey, fetchImpl?, now?, sleep?, random? })` with source id `tfl-disruptions-london`, provider tier 1, 5-minute polling, and `fetchChanges({ runId, signal? })`.

- [x] **Step 1: Write fixture-driven failing adapter tests**

Test road closures/collisions, line disruptions anchored to affected stops, severity mapping, source evidence, filtering of future/cleared records, partial malformed records, hostname/redirect safety, bounded payloads, retries, and key placement in the query string.

- [x] **Step 2: Run the adapter test and verify RED**

Run: `node --test backend/live-incidents/adapters/tfl.test.mjs`

Expected: FAIL because `./tfl.mjs` does not exist.

- [x] **Step 3: Implement the minimal provider adapter**

Use only these official endpoints:

```text
GET https://api.tfl.gov.uk/Road/all/Disruption?stripContent=false&app_key=...
GET https://api.tfl.gov.uk/Line/Mode/tube,dlr,overground,elizabeth-line,tram/Disruption?app_key=...
```

Parse TfL `point` as GeoJSON, prefer road `geometry`/street coordinates only when valid, and use affected stop coordinates for line incidents. Map full closures/serious incidents to higher canonical severity while keeping planned works and service information proportionate. Construct evidence links on `https://api.tfl.gov.uk` without including `app_key`.

- [x] **Step 4: Run focused and canonical contract tests**

Run: `node --test backend/live-incidents/adapters/tfl.test.mjs backend/live-incidents/contracts.test.mjs backend/live-incidents/ingestion-service.test.mjs`

Expected: PASS.

- [x] **Step 5: Commit Task 1**

```bash
git add backend/live-incidents/adapters/tfl.mjs backend/live-incidents/adapters/tfl.test.mjs backend/live-incidents/fixtures/tfl-road-disruptions.json backend/live-incidents/fixtures/tfl-line-disruptions.json
git commit -m "feat: ingest official TfL disruptions"
```

### Task 2: Credential-Aware Runtime and Scheduler

**Files:**
- Modify: `backend/live-incidents/sources.mjs`
- Modify: `backend/server.mjs`
- Test: `backend/live-incidents/adapters/tfl.test.mjs`
- Test: `backend/server-architecture.test.mjs`

**Interfaces:**
- Consumes: `createTflAdapter` from Task 1 and `process.env.TFL_APP_KEY`.
- Produces: `createLiveSourceDefinitions(env)` and `createConfiguredLiveAdapters(env)`-equivalent runtime composition used by the server; all enabled adapters are polled on their own intervals.

- [x] **Step 1: Add failing runtime tests**

Prove no key yields `not-configured` and no adapter, a trimmed key yields `enabled` and one TfL adapter, the public source definition never contains the key, and server architecture schedules every configured source rather than hard-coding Environment Agency only.

- [x] **Step 2: Run tests and verify RED**

Run: `node --test backend/live-incidents/adapters/tfl.test.mjs backend/server-architecture.test.mjs`

Expected: FAIL because dynamic runtime composition and multi-source scheduling do not exist.

- [x] **Step 3: Implement dynamic source composition and polling**

Keep the exported no-environment catalogue safe for tests/documentation, derive server definitions from environment, include the TfL adapter only with a non-empty key, and start independent unref'd timers using each adapter's declared interval. Ensure shutdown clears every timer.

- [x] **Step 4: Run backend tests**

Run: `npm run test:backend`

Expected: PASS.

- [x] **Step 5: Commit Task 2**

```bash
git add backend/live-incidents/sources.mjs backend/live-incidents/adapters/tfl.test.mjs backend/server.mjs backend/server-architecture.test.mjs
git commit -m "feat: activate configured TfL live source"
```

### Task 3: Operations, Secret Guard, and Checkpoint

**Files:**
- Modify: `.env.example`
- Modify: `INSTALL.md`
- Modify: `backend/DEPLOYMENT.md`
- Modify: `README.md`
- Modify: `scripts/verify-web-bundle-secrets.test.mjs`

**Interfaces:**
- Consumes: server-side `TFL_APP_KEY` runtime behavior from Task 2.
- Produces: exact operator setup and verification commands without committing a credential.

- [x] **Step 1: Add a failing secret-guard assertion**

Prove `TFL_APP_KEY` and `app_key` credentials cannot be supplied through an `EXPO_PUBLIC_*` variable or emitted in the web bundle.

- [x] **Step 2: Run the guard and verify RED**

Run: `node --test scripts/verify-web-bundle-secrets.test.mjs`

Expected: FAIL until the new provider secret is covered.

- [x] **Step 3: Document setup and source truth**

Document free TfL portal registration, backend-only `.env` placement, London-only coverage, no-key behavior, source-status verification, and local commands. Do not include a real key.

- [x] **Step 4: Run complete verification**

Run: `npm test`

Expected: PASS.

Run: `npx expo export --platform all --output-dir dist-all`

Expected: PASS for web, iOS, and Android.

- [x] **Step 5: Commit and push the checkpoint**

```bash
git add .env.example INSTALL.md backend/DEPLOYMENT.md README.md scripts/verify-web-bundle-secrets.test.mjs docs/superpowers/plans/2026-09-22-tfl-live-disruptions.md
git commit -m "docs: add TfL live source setup"
git push origin Macbook
```
