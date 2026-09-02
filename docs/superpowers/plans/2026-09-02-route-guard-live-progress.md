# Route Guard Live Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a free website Route Guard journey tracker that watches the user's live browser location after a route scan and warns when they are near or approaching an elevated route section.

**Architecture:** Keep routing free for now with the existing `free-osm` backend scan. Add a shared `route-guard/progress.ts` helper that compares browser coordinates against scanned route samples, then surface that result in `components/RouteGuard.tsx`. No Google Maps API, Supabase, Stripe, or frontend secret is required for this slice.

**Tech Stack:** Expo React Native Web, TypeScript, Node test runner with `--experimental-strip-types`, existing RiskRadar API client and map canvas.

**Spec:** User-approved Live Radar direction in chat: UK-only/free for now, GPS-style route awareness, warnings as users move, later replace free routing with Google Routes API when billing is approved.

## Global Constraints

- Do not require `GOOGLE_MAPS_API_KEY`.
- Do not put any Google, Supabase, or Stripe secret in frontend code.
- Website version must work without Supabase configured.
- Keep current RiskRadar visual style.
- Use TDD: route progress helper must have failing tests before implementation.
- Finish each task with verification and a commit-ready checkpoint.

---

### Task 1: Shared Route Progress Engine

**Files:**
- Create: `route-guard/progress.ts`
- Test: `route-guard/progress.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: route points shaped as `{ latitude: number; longitude: number }`.
- Consumes: sampled risks shaped as `{ pointIndex: number; latitude: number; longitude: number; score: number; riskLevel: 'low' | 'amber' | 'red'; basis: string }`.
- Produces: `summarizeRouteProgress(input): RouteGuardProgressSummary`.

- [ ] **Step 1: Verify the failing test**

Run:

```bash
node --no-warnings --experimental-strip-types --test route-guard/*.test.ts
```

Expected: FAIL because `route-guard/progress.ts` is missing.

- [ ] **Step 2: Implement `summarizeRouteProgress`**

Create `route-guard/progress.ts` with:

```ts
export type RouteProgressRiskLevel = 'low' | 'amber' | 'red';

export interface RouteProgressPoint {
  latitude: number;
  longitude: number;
}

export interface RouteProgressSample extends RouteProgressPoint {
  pointIndex: number;
  score: number;
  riskLevel: RouteProgressRiskLevel;
  basis: string;
}

export interface RouteGuardProgressInput {
  currentLocation: RouteProgressPoint;
  routePoints: RouteProgressPoint[];
  routeRiskSamples: RouteProgressSample[];
  alertRadiusMetres?: number;
  offRouteThresholdMetres?: number;
}

export interface RouteGuardProgressSummary {
  status: 'on-route' | 'off-route';
  distanceToRouteMetres: number;
  nearestSample?: RouteProgressSample & { distanceMetres: number };
  upcomingHotzone?: RouteProgressSample & { distanceMetres: number };
  message: string;
}
```

- [ ] **Step 3: Add route progress to the full test script**

Update `package.json`:

```json
"test": "npm run typecheck && npm run test:live-radar && npm run test:route-guard && npm run test:backend && npm run test:build-guard && npm run test:git-guard",
"test:route-guard": "node --no-warnings --experimental-strip-types --test route-guard/*.test.ts"
```

- [ ] **Step 4: Verify**

Run:

```bash
npm run test:route-guard
```

Expected: PASS for all route progress tests.

### Task 2: Website Journey Tracker UI

**Files:**
- Modify: `components/RouteGuard.tsx`

**Interfaces:**
- Consumes: `summarizeRouteProgress` from `route-guard/progress.ts`.
- Uses: browser `navigator.geolocation.watchPosition`.
- Produces: a live-position card inside the Route Guard result panel.

- [ ] **Step 1: Add state and browser watcher**

Add state for `tracking`, `journeyLocation`, `journeyAccuracy`, and `trackingError`. Add `startJourneyTracking()` and `stopJourneyTracking()` using `watchPosition`, and clear the watcher in `useEffect` cleanup.

- [ ] **Step 2: Render live route awareness**

Pass current location into `RouteResult`, calculate progress with `summarizeRouteProgress`, and show:

```tsx
<Text>Live route awareness</Text>
<Text>{progress.message}</Text>
<Text>{progress.nearestSample?.score}/100 near your current route position</Text>
```

Use the same risk colors as the route dots.

- [ ] **Step 3: Keep the map useful**

Use the current location as the selected point when available. Keep all route sample dots visible.

- [ ] **Step 4: Verify**

Run:

```bash
npm run typecheck
npm run build:web
```

Expected: both commands exit 0.

### Task 3: Checkpoint And Push

**Files:**
- All modified files from Tasks 1 and 2.

- [ ] **Step 1: Full verification**

Run:

```bash
npm test
npm run build:web
```

Expected: both commands exit 0.

- [ ] **Step 2: Commit**

Run:

```bash
git add .
git commit -m "feat: track route guard journey progress"
```

- [ ] **Step 3: Push**

Run:

```bash
git push origin Macbook
```

If terminal authentication fails, open GitHub Desktop and click `Push origin`.
