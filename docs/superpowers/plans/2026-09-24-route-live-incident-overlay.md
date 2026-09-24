# Route Live Incident Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the public official incidents that contribute to Route Guard's live score directly on the active journey map.

**Architecture:** `/api/live-risk` will return a bounded public projection containing only incidents whose IDs appear in the calculated route contributors. The client will validate and convert those incidents through the existing live-incident presentation layer, then preserve the last successful overlay while polling retries and clear it when a different route is scanned.

**Tech Stack:** Node.js HTTP routes and tests, TypeScript, React Native/Expo, React Leaflet, react-native-maps.

**Spec:** `docs/superpowers/specs/2026-08-27-riskradar-live-safety-network-design.md`

## Global Constraints

- Return public incident fields only; never expose observations, evidence payloads, internal review fields, or credentials.
- Only incidents that changed at least one route sample may be returned.
- Keep the existing one-minute foreground refresh cadence and free OSM route provider.
- Official source links must remain HTTPS-only on the client.
- A failed refresh must preserve the last successful route risk and marker overlay.

## Review Focus

- A nearby but non-contributing incident must not be returned or drawn.
- Duplicate incidents found at multiple route samples must produce one marker.
- Malformed incident geometry or unsafe source URLs must not become map markers.
- A transient refresh failure must preserve the last successful markers.
- Starting a new route scan must clear markers from the previous journey.

---

### Task 1: Public Route Incident Response

**Files:**
- Modify: `backend/live-incidents/routes.mjs`
- Test: `backend/live-incidents/routes.test.mjs`

**Interfaces:**
- Consumes: `calculateRouteLiveRisk(...).contributingIncidentIds` and `toPublicIncident(incident)`.
- Produces: `POST /api/live-risk` route response field `incidents: PublicLiveIncident[]`.

- [ ] **Step 1: Write the failing route response test**

Add two nearby public incidents, one inside and one outside its affected radius. Assert the response contains one deduplicated contributing incident, omits the other, and does not contain private evidence fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/live-incidents/routes.test.mjs`
Expected: FAIL because the route response has no `incidents` field.

- [ ] **Step 3: Implement the bounded public projection**

Filter the deduplicated queried incidents against `live.contributingIncidentIds`, project each through `toPublicIncident`, and include the result in the route response.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/live-incidents/routes.test.mjs`
Expected: PASS.

### Task 2: Strict Marker Conversion in Route Refresh

**Files:**
- Modify: `live-incidents/presentation.ts`
- Modify: `route-guard/refresh.ts`
- Test: `live-incidents/presentation.test.ts`
- Test: `route-guard/refresh.test.ts`

**Interfaces:**
- Produces: `buildLiveIncidentMarkers(value: unknown): LiveIncidentMapMarker[]`.
- Produces: `applyRouteLiveRefresh(...).liveIncidentMarkers`.

- [ ] **Step 1: Write failing presentation and refresh tests**

Assert valid public incidents become severity-coloured markers, malformed geometry and `javascript:` URLs are rejected/sanitised, and duplicate IDs yield one marker.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `node --no-warnings --experimental-strip-types --test live-incidents/presentation.test.ts route-guard/refresh.test.ts`
Expected: FAIL because the standalone marker builder and route marker result do not exist.

- [ ] **Step 3: Add marker conversion and response validation**

Export a deduplicating `buildLiveIncidentMarkers` wrapper around the existing private conversion. Extend `RouteLiveRefresh` with `incidents` and include converted markers in the applied update.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `node --no-warnings --experimental-strip-types --test live-incidents/presentation.test.ts route-guard/refresh.test.ts`
Expected: PASS.

### Task 3: Active Journey Map Overlay

**Files:**
- Modify: `components/RouteGuard.tsx`
- Modify: `components/route-guard-map-contract.typecheck.tsx`

**Interfaces:**
- Consumes: `applyRouteLiveRefresh(...).liveIncidentMarkers`.
- Produces: `CrimeMapCanvas liveIncidentMarkers={...}` for the active route.

- [ ] **Step 1: Strengthen the compile-time map contract**

Pass a representative live marker through the Route Guard map contract so removal or type drift fails typecheck.

- [ ] **Step 2: Wire successful polling results into map state**

Store the latest marker array, pass it to `CrimeMapCanvas`, keep it on refresh errors, and reset it in the existing `scannedResult` reset effect.

- [ ] **Step 3: Run full verification**

Run: `npm test`
Expected: typecheck and all test groups PASS.

Run: `npm run build:web`
Expected: Expo web export and public-secret scanner PASS.

- [ ] **Step 4: Commit and push**

```bash
git add backend/live-incidents/routes.mjs backend/live-incidents/routes.test.mjs live-incidents/presentation.ts live-incidents/presentation.test.ts route-guard/refresh.ts route-guard/refresh.test.ts components/RouteGuard.tsx components/route-guard-map-contract.typecheck.tsx docs/superpowers/plans/2026-09-24-route-live-incident-overlay.md
git commit -m "feat: show live incidents on guarded routes"
git push origin Macbook
```
