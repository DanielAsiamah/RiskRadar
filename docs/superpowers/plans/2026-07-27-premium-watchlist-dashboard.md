# RiskRadar Premium Watchlist Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Premium members a personal dashboard for ten watched postcodes, twelve-month trends, and evidence-based explanations of what changed.

**Architecture:** Watched places live in Supabase with RLS, while protected Node routes enforce the Premium entitlement and reuse the existing postcode analysis pipeline. Snapshot and change-summary logic is pure and testable; the Expo client renders the returned dashboard view model without recalculating billing or crime conclusions.

**Tech Stack:** React Native Web, TypeScript, Supabase Postgres/RLS, Node.js 22, existing Police.uk intelligence pipeline, `node:test`, React Native SVG.

## Global Constraints

- Preserve current RiskRadar styling and existing postcode, map, evidence, and comparison behavior.
- Watchlists contain at most ten places per active Premium account.
- Every result states its Police.uk data month and approximate postcode radius.
- Never claim exact addresses, exact incident days, live population, or live emergency risk.
- All watchlist routes require a verified Supabase bearer token and server-side Premium entitlement.
- Dashboard responses use `Cache-Control: private, no-store`.
- Use the existing category colors for charts, map dots, and numeric category counts.

---

### Task 1: Add Watchlist and Snapshot Schema

**Files:**
- Create: `supabase/migrations/202607270002_watchlists.sql`
- Test: `backend/membership/watchlist-schema.test.mjs`

**Interfaces:**
- Produces: `public.watched_places`.
- Produces: database function `public.enforce_watch_limit()`.

- [ ] **Step 1: Write a failing migration contract test**

Assert the migration includes `watched_places`, unique
`(user_id, normalized_postcode)`, RLS, owner policies, and the ten-place
enforcement trigger.

- [ ] **Step 2: Run the test**

```powershell
node --test backend/membership/watchlist-schema.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Create the migration**

Use:

```sql
create table public.watched_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  postcode text not null,
  normalized_postcode text not null,
  last_checked_month text,
  last_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_postcode)
);
```

The trigger rejects an eleventh insert with `WATCH_LIMIT_REACHED`. Users can
select, insert, update, and delete only their own rows.

- [ ] **Step 4: Run the test and commit**

```powershell
node --test backend/membership/watchlist-schema.test.mjs
git add supabase backend/membership/watchlist-schema.test.mjs
git commit -m "feat: add premium watched places"
```

### Task 2: Implement Watchlist Store and Protected Routes

**Files:**
- Create: `backend/membership/watchlist-store.mjs`
- Create: `backend/membership/watchlist-routes.mjs`
- Modify: `backend/membership/routes.mjs`
- Test: `backend/membership/watchlist-store.test.mjs`
- Test: `backend/membership/watchlist-routes.test.mjs`

**Interfaces:**
- Produces: `normalizeWatchedPostcode(value): string`.
- Produces: `createWatchlistStore(config, fetchImpl)`.
- Handles: `GET/POST /api/watchlist` and
  `PATCH/DELETE /api/watchlist/:id`.

- [ ] **Step 1: Write failing store tests**

Cover normalized UK postcode spacing/case, owner filtering, duplicate
postcodes, label length, missing IDs, and translating Supabase trigger failure
to `WATCH_LIMIT_REACHED`.

- [ ] **Step 2: Write failing route tests**

Assert every route rejects missing auth, free accounts receive
`PREMIUM_REQUIRED`, one user cannot access another user's row, and all success
responses contain only camelCase public fields.

- [ ] **Step 3: Run tests**

```powershell
node --test backend/membership/watchlist-store.test.mjs backend/membership/watchlist-routes.test.mjs
```

Expected: FAIL.

- [ ] **Step 4: Implement store and routes**

Expose:

```js
list(userId)
create(userId, { label, postcode })
update(userId, id, { label })
remove(userId, id)
saveSnapshot(userId, id, { dataMonth, snapshot })
```

Resolve and validate a postcode through the existing analysis pipeline before
inserting it. Route errors use `INVALID_POSTCODE`, `DUPLICATE_WATCH`,
`WATCH_LIMIT_REACHED`, and `WATCH_NOT_FOUND`.

- [ ] **Step 5: Run tests and commit**

```powershell
node --test backend/membership/watchlist-store.test.mjs backend/membership/watchlist-routes.test.mjs
git add backend/membership
git commit -m "feat: protect premium watchlists"
```

### Task 3: Build Stable Dashboard and Change-Summary View Models

**Files:**
- Create: `backend/membership/dashboard-view.mjs`
- Create: `backend/membership/change-summary.mjs`
- Test: `backend/membership/dashboard-view.test.mjs`
- Test: `backend/membership/change-summary.test.mjs`

**Interfaces:**
- Produces: `buildWatchSnapshot(analysis): WatchSnapshot`.
- Produces: `compareWatchSnapshots(current, previous): ChangeSummary`.
- Produces: `buildDashboardView({ places, analyses, entitlement }): DashboardView`.

- [ ] **Step 1: Write failing snapshot tests**

The snapshot includes:

```js
{
  dataMonth: '2026-05',
  score: 6,
  totalIncidents: 66,
  categories: [{ category: 'violent-crime', count: 25 }],
  trend: [{ month: '2026-05', total: 66 }],
  topRoads: [{ name: 'On or near Blackheath Hill', count: 8 }],
  generatedAt: '<iso>'
}
```

Strip raw person/outcome fields and cap stored lists.

- [ ] **Step 2: Write failing change tests**

Cover rising/cooling/stable thresholds, zero baselines, missing months, category
movement, score movement, and language:

```text
Total recorded incidents fell 11% against the previous three-month average,
while violent crime rose slightly.
```

Never use `safer` or `more dangerous` from one month alone.

- [ ] **Step 3: Run tests**

```powershell
node --test backend/membership/dashboard-view.test.mjs backend/membership/change-summary.test.mjs
```

Expected: FAIL.

- [ ] **Step 4: Implement pure builders**

Use a stable direction rule:

- `rising`: at least +10% and at least +3 incidents.
- `cooling`: at most -10% and at least -3 incidents.
- `stable`: all other comparable values.
- `insufficient-data`: fewer than two comparable months.

- [ ] **Step 5: Run tests and commit**

```powershell
node --test backend/membership/dashboard-view.test.mjs backend/membership/change-summary.test.mjs
git add backend/membership
git commit -m "feat: explain watched-place changes"
```

### Task 4: Add Protected Dashboard API

**Files:**
- Create: `backend/membership/dashboard-routes.mjs`
- Modify: `backend/membership/routes.mjs`
- Modify: `backend/server.mjs`
- Modify: `backend/api-catalog.mjs`
- Test: `backend/membership/dashboard-routes.test.mjs`

**Interfaces:**
- Handles: `GET /api/dashboard`.
- Consumes: `analyzeLocation(query)`,
  `fetchMonthlyCrimeSeries({ postcode, monthCount: 12 })`, and watchlist store.
- Produces: `{ entitlement, briefing, places, selectedPlace }`.

- [ ] **Step 1: Write failing route tests**

Cover auth/Premium enforcement, empty watchlist, one failed Police.uk analysis
not failing the whole dashboard, snapshot persistence, and cached analysis
reuse.

- [ ] **Step 2: Run the test**

```powershell
node --test backend/membership/dashboard-routes.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement route with bounded concurrency**

Use the existing `mapSettledWithConcurrency` with concurrency two. Fetch the
normal postcode analysis and an explicit twelve-month series for each place;
do not reuse the current six-month `TREND_MONTH_COUNT`. Return a per-place
`available` flag and readable error. Select the first available place unless
`watchId` is supplied and owned by the user.

- [ ] **Step 4: Wire and document**

Pass `analyzeLocation` into the membership route factory rather than importing
`server.mjs`. Add the route to the catalog.

- [ ] **Step 5: Run backend tests and commit**

```powershell
npm run test:backend
git add backend
git commit -m "feat: serve premium safety dashboard"
```

### Task 5: Build Watchlist and Dashboard Client APIs

**Files:**
- Create: `api/dashboard.ts`
- Create: `membership/dashboard-types.ts`
- Test: `membership/dashboard-types.typecheck.ts`

**Interfaces:**
- Produces: `listWatchedPlaces`, `addWatchedPlace`, `renameWatchedPlace`,
  `removeWatchedPlace`, and `getDashboard`.

- [ ] **Step 1: Define exact client contracts**

Include `WatchedPlace`, `WatchSnapshot`, `ChangeDirection`,
`DashboardPlace`, and `DashboardView`. Match backend camelCase names exactly.

- [ ] **Step 2: Implement authenticated wrappers**

All wrappers use `apiRequest(..., 'required')`. `getDashboard(watchId?)` adds a
URL-encoded query only when a watch ID is present.

- [ ] **Step 3: Verify**

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add api membership
git commit -m "feat: add dashboard API contracts"
```

### Task 6: Build the Premium Dashboard UI

**Files:**
- Create: `components/PremiumDashboard.tsx`
- Create: `components/WatchedPlaceCard.tsx`
- Create: `components/WatchPlaceForm.tsx`
- Create: `components/MonthlyBriefing.tsx`
- Modify: `components/IntelligenceCharts.tsx`
- Modify: `components/ComparePostcodes.tsx`
- Modify: `App.tsx`
- Modify: `components/Results.tsx`

**Interfaces:**
- Consumes: `DashboardView` and watchlist API.
- Produces screens: `DASHBOARD`, `WATCH_PLACE`.

- [ ] **Step 1: Build dashboard states**

Render loading skeletons, empty watchlist onboarding, partial-data notices,
membership recovery, and the approved monthly briefing layout.

- [ ] **Step 2: Build watched-place cards**

Each card shows label, postcode, data month, score, total incidents, direction,
and category movement. Use green only for cooling, rose only for rising, and
slate for stable/insufficient data.

- [ ] **Step 3: Build add/rename/remove flow**

Validate a one-to-forty-character label and postcode. Confirm removal in-app.
On the tenth place, replace the add action with the clear plan limit.

- [ ] **Step 4: Extend trends to twelve months**

Update `IntelligenceCharts` to accept six or twelve points without changing
existing result usage. Match category number colors to map dots.

- [ ] **Step 5: Add watch action to Results**

Premium members can save the current postcode with a label. Free/signed-out
users enter the existing Premium gate and resume the same action afterward.

- [ ] **Step 6: Make five-area comparison Premium**

Keep a two-area comparison preview for free visitors. Adding a third through
fifth area or submitting more than two enters the Premium gate, preserves the
entered postcodes, and resumes after entitlement. The backend protected
comparison request accepts at most five unique places.

- [ ] **Step 7: Verify responsive behavior**

At 375px the dashboard is one column; at 900px watched places and trend panels
form two columns. No horizontal scrolling.

- [ ] **Step 8: Run verification and commit**

```powershell
npm run typecheck
npm run test:backend
npm run build:web
git add App.tsx components
git commit -m "feat: add watched-place intelligence dashboard"
```

## Plan Acceptance

- Premium members can add, rename, remove, and select up to ten postcodes.
- Free users cannot call protected watchlist/dashboard routes.
- The dashboard shows twelve-month evidence with explicit data months.
- Change language is deterministic, tested, and does not overclaim safety.
- Existing result, map, comparison, and evidence screens remain functional.
