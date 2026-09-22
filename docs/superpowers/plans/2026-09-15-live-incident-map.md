# Live Incident Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show named, source-backed live incidents around the user's latest Live Radar position on both web and native maps.

**Architecture:** Add a typed public client for `GET /api/live-incidents`, keep response validation and map presentation in pure testable modules, and extend the existing cross-platform map canvas with a separate live-incident layer. `LiveRadar.tsx` owns refresh lifecycle and presents source freshness, incident details, and retry state without changing the existing monitoring engine.

**Tech Stack:** Expo SDK 54, React Native, React Native Maps, React Leaflet, TypeScript, Node test runner, existing RiskRadar Node API.

**Spec:** `docs/superpowers/specs/2026-08-27-riskradar-live-safety-network-design.md`

## Global Constraints

- Police.uk monthly records must never be labelled live.
- Every live marker must retain provider, confidence, precision, and source timestamps.
- Source failure must be shown as unavailable, not as proof that an area has no incidents.
- RiskRadar remains area intelligence, not emergency guidance or guaranteed safety.
- The website continues to work without Supabase, Google Maps, or TfL credentials.
- No backend key enters frontend code.

---

### Task 1: Typed Live Incident Client And Presentation Model

**Files:**
- Create: `live-incidents/types.ts`
- Create: `live-incidents/presentation.ts`
- Create: `live-incidents/presentation.test.ts`
- Modify: `api/live-radar.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: public `GET /api/live-incidents` payloads.
- Produces: `fetchLiveIncidentsNear(point, options)` and `buildLiveIncidentMapModel(response)`.

- [x] **Step 1: Write failing tests**

Test literal fixtures for severity colours, source-backed labels, sorted cards, stale/limited source disclosure, malformed coordinates being excluded, and an empty healthy result being distinguished from source unavailability.

- [x] **Step 2: Run tests and verify RED**

Run: `node --no-warnings --experimental-strip-types --test live-incidents/*.test.ts`

Expected: FAIL because `live-incidents/presentation.ts` is absent.

- [x] **Step 3: Implement the pure model and API client**

Define the complete allow-listed incident response shape. Convert valid incidents into marker/card models with severity colours and factual source metadata. Fetch a bounded 10 km radius with a 12-second timeout.

- [x] **Step 4: Verify GREEN**

Run: `npm run test:live-incidents`

Expected: all live-incident presentation tests pass.

### Task 2: Cross-Platform Live Incident Map Layer

**Files:**
- Modify: `components/map-types.ts`
- Modify: `components/CrimeMapCanvas.web.tsx`
- Modify: `components/CrimeMapCanvas.native.tsx`
- Modify: `components/LiveRadar.tsx`
- Create: `components/live-incident-contract.typecheck.tsx`

**Interfaces:**
- Consumes: `LiveIncidentMapMarker[]` from the Task 1 presentation model.
- Produces: visible source-backed live marker circles/callouts and a current-area Live Radar map.

- [x] **Step 1: Add a compile-time failing contract fixture**

Render `CrimeMapCanvas` with a live marker and render `LiveRadar` with an explicit current coordinate. Typecheck must fail until both component contracts exist.

- [x] **Step 2: Run typecheck and verify RED**

Run: `npm run typecheck`

Expected: FAIL on missing `liveIncidentMarkers` and current-coordinate props.

- [x] **Step 3: Implement map and screen behavior**

Draw live markers separately from monthly crime dots, use severity colour and affected radius, expose provider/confidence/time/location in tooltips or callouts, and open only validated HTTPS source URLs. Fetch immediately when a current reading includes coordinates, refresh every 60 seconds while monitoring is active, preserve the last successful map during transient failures, and label coverage honestly.

- [x] **Step 4: Verify GREEN**

Run: `npm run typecheck && npm run test:live-incidents && npm run build:web`

Expected: typecheck, focused tests, and web export pass.

### Task 3: Runtime Proof And Checkpoint

**Files:**
- Modify: `INSTALL.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed live-map flow.
- Produces: reproducible local and device test instructions.

- [x] **Step 1: Document source and refresh behavior**

Document the Environment Agency ingestion requirement, current 60-second client refresh, source limitations, and native/web testing flow.

- [x] **Step 2: Run complete verification**

Run: `npm test && npx expo export --platform all --output-dir dist-all`

Expected: all tests and all three platform bundles pass.

- [x] **Step 3: Commit and push**

```bash
git add .
git commit -m "feat: map live safety incidents"
git push origin Macbook
```
