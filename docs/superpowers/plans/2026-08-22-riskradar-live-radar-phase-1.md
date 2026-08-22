# RiskRadar Live Radar Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Live Radar Phase 1 for RiskRadar with native permission onboarding, manual and background current-area monitoring, local alert history, Pro gating, and a lighter web keep-open Journey Radar mode.

**Architecture:** Add a local-first Live Radar subsystem beside the existing public search, Route Guard, and Premium dashboard flows. Keep the backend unchanged for scoring by reusing existing postcode intelligence routes, while splitting client responsibilities into focused Live Radar modules for storage, permission handling, evaluation, web session polling, and native background task orchestration.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, AsyncStorage, `expo-location`, existing `fetch` API client, Node test runner, existing TypeScript contract checks, and if required by implementation discovery, supported Expo task and notifications packages installed with `npx expo install`.

**Spec:** `docs/superpowers/specs/2026-08-22-riskradar-live-radar-design.md`

## Global Constraints

- Phase 1 must implement foreground location permission, background location permission, notification permission, a permission onboarding modal, `Turn On Live Radar`, `Turn Off Live Radar`, `Scan My Current Location Now`, a Live Radar status card, local notification alerts, basic local alert history, Pro gating for background tracking, and the lighter web Journey Radar mode.
- Phase 1 must use the current codebase's existing postcode intelligence pipeline rather than introducing a new scoring backend.
- Phase 1 must work without Supabase being configured; local-first fallback is required.
- Web and Safari copy must explicitly use wording like `Keep this page open to monitor your current area.` and must not promise full background tracking.
- Live Radar must not imply emergency dispatch, live police data, guaranteed-safe routing, or hidden continuous tracking.
- Alert thresholds are: entering a higher-risk area, score `>= 65`, or score jump `>= 12` where the new score is `>= 50`.
- Cooldown is 25 minutes between alerts, except manual scans may still update status and history without spamming notifications.
- Native background tracking targets 250 metre distance and 10 minute time intervals.
- Phase 1 must preserve public search when Premium auth or billing is unavailable.
- Any new Expo packages must be installed with `npx expo install` and remain compatible with the current Expo SDK 54 baseline.

---

## File Structure

- Create: `live-radar/types.ts`
  - Shared contracts for status, readings, alert events, settings, permissions, and scan outcomes.
- Create: `live-radar/storage.ts`
  - AsyncStorage parsing, serialization, migration-safe defaults, and bounded local history persistence.
- Create: `live-radar/storage.test.ts`
  - TypeScript-oriented unit coverage through Node test runner for parsing and cooldown state handling.
- Create: `live-radar/evaluator.ts`
  - Stateless rule evaluation for risk transitions, cooldown checks, mute/reduce settings, and explanation generation.
- Create: `live-radar/evaluator.test.ts`
  - Unit tests for threshold rules, higher-risk-area detection, cooldown, and suppressed states.
- Create: `live-radar/client.ts`
  - Reads coordinates, resolves nearby postcode, analyzes it, and normalizes the existing backend response into a Live Radar reading.
- Create: `live-radar/client.test.ts`
  - Tests normalized reading construction and degraded-path error normalization with mocked API calls.
- Create: `live-radar/permissions.ts`
  - Foreground, background, and notification permission helpers plus a stable permission snapshot contract.
- Create: `live-radar/web-session.ts`
  - Browser-only polling and timer lifecycle for keep-open monitoring.
- Create: `live-radar/native-task.ts`
  - Background task registration and task callback wrapper around Live Radar scans.
- Create: `api/live-radar.ts`
  - Small API-facing wrapper that uses `api/client.ts` and exports focused helpers for location suggestions and postcode intelligence.
- Create: `components/LiveRadar.tsx`
  - Main Live Radar screen UI for native and web, including onboarding, status card, actions, warnings, and history.
- Create: `components/live-radar-contract.typecheck.tsx`
  - Contract-only compile coverage for the new screen props and state.
- Modify: `App.tsx`
  - Add the `LIVE_RADAR` app state, hydrate Live Radar local state, wire navigation from home, pricing, and dashboard, and provide Pro gating.
- Modify: `components/Landing.tsx`
  - Add the Live Radar entry point and aligned free/web wording.
- Modify: `components/Pricing.tsx`
  - Surface Live Radar as a Pro capability preview and link into the screen.
- Modify: `components/PremiumDashboard.tsx`
  - Add a dashboard entry point and optional recent-alert summary stub from local history.
- Modify: `components/Faq.tsx` or `content/faq.ts`
  - Expand FAQ copy for native versus web monitoring and notification limitations if required by current copy gaps.
- Modify: `INSTALL.md`
  - Document Live Radar setup, permission expectations, local-first fallback, and web keep-open wording.
- Modify: `package.json`
  - Add any new Expo-compatible dependencies and ensure tests cover the new modules.

## Task 1: Shared Live Radar contracts, storage, and evaluation

**Files:**
- Create: `live-radar/types.ts`
- Create: `live-radar/storage.ts`
- Create: `live-radar/storage.test.ts`
- Create: `live-radar/evaluator.ts`
- Create: `live-radar/evaluator.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `type LiveRadarRiskLevel = 'low' | 'moderate' | 'elevated' | 'high'`
  - `type LiveRadarTrigger = 'entered-higher-risk-area' | 'score-threshold' | 'sharp-jump'`
  - `interface LiveRadarSettings`
  - `interface LiveRadarReading`
  - `interface LiveRadarAlertEvent`
  - `interface LiveRadarPermissionSnapshot`
  - `function createDefaultLiveRadarSettings(now?: Date): LiveRadarSettings`
  - `function parseLiveRadarStore(raw: string | null): LiveRadarStore`
  - `function appendAlertHistory(store: LiveRadarStore, event: LiveRadarAlertEvent, maxEntries?: number): LiveRadarStore`
  - `function evaluateLiveRadarTransition(input: EvaluateLiveRadarTransitionInput): EvaluateLiveRadarTransitionResult`
- Consumes: existing local-first storage patterns already used in `App.tsx` and `membership/client-state.mjs`

- [ ] **Step 1: Write the failing tests**

Create `live-radar/evaluator.test.ts` and `live-radar/storage.test.ts` with concrete cases:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { evaluateLiveRadarTransition } from './evaluator';
import { appendAlertHistory, parseLiveRadarStore } from './storage';

test('alerts when score reaches 65 or above', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: null,
    nextReading: {
      checkedAt: '2026-08-22T10:00:00.000Z',
      postcode: 'SE10 8EP',
      score: 66,
      riskLevel: 'high',
      mainReason: 'Violent crime is the leading local pressure.',
      dataMonth: '2026-06',
      accuracyMetres: 24,
      accuracyState: 'good',
      source: 'manual',
    },
    settings: {
      enabled: true,
      mode: 'native-background',
      alertsReduced: false,
      mutedPostcodes: [],
      lastAlertAt: null,
      onboardingCompleted: true,
    },
    nowIso: '2026-08-22T10:00:00.000Z',
  });

  assert.equal(result.shouldAlert, true);
  assert.equal(result.trigger, 'score-threshold');
  assert.match(result.explanation ?? '', /65/i);
});

test('suppresses alerts during cooldown', () => {
  const result = evaluateLiveRadarTransition({
    previousReading: {
      checkedAt: '2026-08-22T09:50:00.000Z',
      postcode: 'SE10 8EP',
      score: 52,
      riskLevel: 'elevated',
      mainReason: 'Volume is elevated.',
      dataMonth: '2026-06',
      accuracyMetres: 20,
      accuracyState: 'good',
      source: 'background',
    },
    nextReading: {
      checkedAt: '2026-08-22T10:00:00.000Z',
      postcode: 'SE10 8EP',
      score: 68,
      riskLevel: 'high',
      mainReason: 'Violent crime is the leading local pressure.',
      dataMonth: '2026-06',
      accuracyMetres: 22,
      accuracyState: 'good',
      source: 'background',
    },
    settings: {
      enabled: true,
      mode: 'native-background',
      alertsReduced: false,
      mutedPostcodes: [],
      lastAlertAt: '2026-08-22T09:45:00.000Z',
      onboardingCompleted: true,
    },
    nowIso: '2026-08-22T10:00:00.000Z',
  });

  assert.equal(result.shouldAlert, false);
  assert.equal(result.suppressedByCooldown, true);
});

test('keeps only the newest bounded alert history entries', () => {
  const empty = parseLiveRadarStore(null);
  const withOne = appendAlertHistory(empty, {
    id: 'alert_1',
    createdAt: '2026-08-22T10:00:00.000Z',
    postcode: 'SE10 8EP',
    score: 66,
    riskLevel: 'high',
    trigger: 'score-threshold',
    explanation: 'Score reached 65 or above.',
    notificationSent: true,
  }, 1);

  const withTwo = appendAlertHistory(withOne, {
    id: 'alert_2',
    createdAt: '2026-08-22T11:00:00.000Z',
    postcode: 'BR1 5NN',
    score: 52,
    riskLevel: 'elevated',
    trigger: 'sharp-jump',
    explanation: 'Score jumped by at least 12 points.',
    notificationSent: false,
  }, 1);

  assert.equal(withTwo.history.length, 1);
  assert.equal(withTwo.history[0]?.id, 'alert_2');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test live-radar/evaluator.test.ts live-radar/storage.test.ts
```

Expected: FAIL with module-not-found errors for the new Live Radar modules.

- [ ] **Step 3: Install any required package support if the design requires it**

If evaluation and storage can be implemented without extra packages, skip this step. If implementation discovers a required Expo-compatible package for later tasks, install it now with:

```powershell
npx expo install expo-task-manager expo-notifications
```

Expected: `package.json` and lockfile update cleanly with SDK-compatible versions.

- [ ] **Step 4: Write minimal implementations**

Create `live-radar/types.ts`, `live-radar/storage.ts`, and `live-radar/evaluator.ts` with concrete defaults and serialization helpers. Core rule code should follow this shape:

```ts
export function evaluateLiveRadarTransition(input: EvaluateLiveRadarTransitionInput): EvaluateLiveRadarTransitionResult {
  const { previousReading, nextReading, settings, nowIso } = input;
  const now = Date.parse(nowIso);
  const cooldownMs = 25 * 60 * 1000;
  const lastAlertAt = settings.lastAlertAt ? Date.parse(settings.lastAlertAt) : null;
  const muted = settings.mutedPostcodes.includes(nextReading.postcode);

  if (muted) {
    return { shouldAlert: false, suppressedByMute: true };
  }

  if (lastAlertAt && now - lastAlertAt < cooldownMs) {
    return { shouldAlert: false, suppressedByCooldown: true };
  }

  if (nextReading.score >= 65) {
    return {
      shouldAlert: true,
      trigger: 'score-threshold',
      explanation: 'The local score reached 65 or above.',
    };
  }

  const scoreJump = previousReading ? nextReading.score - previousReading.score : 0;
  if (scoreJump >= 12 && nextReading.score >= 50) {
    return {
      shouldAlert: true,
      trigger: 'sharp-jump',
      explanation: 'The local score jumped sharply and is now at least 50.',
    };
  }

  if (previousReading && nextReading.score > previousReading.score && nextReading.riskLevel !== previousReading.riskLevel) {
    return {
      shouldAlert: true,
      trigger: 'entered-higher-risk-area',
      explanation: 'You entered a higher-risk area than the previous accepted reading.',
    };
  }

  return { shouldAlert: false };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run:

```powershell
node --test live-radar/evaluator.test.ts live-radar/storage.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json live-radar/types.ts live-radar/storage.ts live-radar/storage.test.ts live-radar/evaluator.ts live-radar/evaluator.test.ts
git commit -m "feat: add live radar core state and rules"
```

## Task 2: API normalization, permissions, and monitoring primitives

**Files:**
- Create: `api/live-radar.ts`
- Create: `live-radar/client.ts`
- Create: `live-radar/client.test.ts`
- Create: `live-radar/permissions.ts`
- Create: `live-radar/web-session.ts`
- Create: `live-radar/native-task.ts`

**Interfaces:**
- Consumes:
  - `apiRequest<T>(path, options, timeoutMs, authMode)` from `api/client.ts`
  - `evaluateLiveRadarTransition(...)` from `live-radar/evaluator.ts`
  - `LiveRadar*` types from `live-radar/types.ts`
- Produces:
  - `getNearbyPostcodeForCoordinates(lat: number, lng: number): Promise<string | null>`
  - `fetchLiveRadarReadingForPostcode(postcode: string, source: LiveRadarReadingSource): Promise<LiveRadarReading>`
  - `scanLiveRadarCoordinates(input: ScanLiveRadarCoordinatesInput): Promise<ScanLiveRadarCoordinatesResult>`
  - `readLiveRadarPermissions(): Promise<LiveRadarPermissionSnapshot>`
  - `requestForegroundPermission(): Promise<LiveRadarPermissionSnapshot>`
  - `requestBackgroundPermission(): Promise<LiveRadarPermissionSnapshot>`
  - `requestNotificationPermission(): Promise<LiveRadarPermissionSnapshot>`
  - `createWebJourneyRadarSession(...)`
  - `ensureNativeLiveRadarTaskRegistered(...)`

- [ ] **Step 1: Write the failing tests**

Create `live-radar/client.test.ts` with mocked API wrappers:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePostcodeAnalysisToLiveRadarReading } from './client';

test('normalizes postcode analysis into a compact Live Radar reading', () => {
  const reading = normalizePostcodeAnalysisToLiveRadarReading({
    postcode: 'SE10 8EP',
    score: 66,
    riskLabel: 'High',
    dataMonth: '2026-06',
    whySummary: 'Violent crime is the leading local pressure.',
  }, {
    accuracyMetres: 18,
    checkedAt: '2026-08-22T11:00:00.000Z',
    source: 'manual',
  });

  assert.equal(reading.postcode, 'SE10 8EP');
  assert.equal(reading.score, 66);
  assert.equal(reading.riskLevel, 'high');
  assert.match(reading.mainReason, /violent/i);
});
```

Add an error-path test asserting that lookup failures are normalized to a non-alerting warning result rather than throwing raw network errors from deep inside the UI.

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test live-radar/client.test.ts
```

Expected: FAIL because `live-radar/client.ts` does not exist yet.

- [ ] **Step 3: Implement API normalization and permission helpers**

Create `api/live-radar.ts` and `live-radar/client.ts` so the scan path is explicit:

```ts
export async function scanLiveRadarCoordinates(input: ScanLiveRadarCoordinatesInput): Promise<ScanLiveRadarCoordinatesResult> {
  const postcode = await getNearbyPostcodeForCoordinates(input.latitude, input.longitude);
  if (!postcode) {
    return {
      ok: false,
      warning: 'No nearby UK postcode could be resolved from this location.',
      suppressAlert: true,
    };
  }

  const reading = await fetchLiveRadarReadingForPostcode(postcode, input.source);
  return {
    ok: true,
    postcode,
    reading: {
      ...reading,
      checkedAt: input.checkedAtIso,
      accuracyMetres: input.accuracyMetres,
      accuracyState: input.accuracyMetres <= 100 ? 'good' : 'poor',
    },
  };
}
```

Create `live-radar/permissions.ts` using `expo-location` and a notification API wrapper. If `expo-notifications` is required, request permissions there; otherwise create a stable adapter with an explicit `unsupported` result for platforms that cannot surface notifications in the current build.

- [ ] **Step 4: Implement web-session and native-task shells**

`live-radar/web-session.ts` should expose timer lifecycle helpers that the UI can start and stop cleanly.

`live-radar/native-task.ts` should expose registration helpers and a typed task callback wrapper, even if some deeper OS-specific behaviour is completed in later tasks. The module must keep task-specific code out of `App.tsx`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```powershell
node --test live-radar/client.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/live-radar.ts live-radar/client.ts live-radar/client.test.ts live-radar/permissions.ts live-radar/web-session.ts live-radar/native-task.ts
git commit -m "feat: add live radar scan and permission primitives"
```

## Task 3: Build the Live Radar screen and wire navigation

**Files:**
- Create: `components/LiveRadar.tsx`
- Create: `components/live-radar-contract.typecheck.tsx`
- Modify: `App.tsx`
- Modify: `components/Landing.tsx`
- Modify: `components/Pricing.tsx`
- Modify: `components/PremiumDashboard.tsx`

**Interfaces:**
- Consumes:
  - Live Radar helpers from Tasks 1 and 2
  - `account?.premium` and `supabaseConfigured` from `App.tsx`
  - existing RiskRadar navigation/state-machine patterns
- Produces:
  - new `AppState` member: `'LIVE_RADAR'`
  - `openLiveRadar` entry points from home, pricing, and dashboard
  - screen props for status, permissions, actions, history, and gating

- [ ] **Step 1: Create a failing compile target**

Modify `App.tsx` to import `./components/LiveRadar` and extend `AppState` with `'LIVE_RADAR'` before the file exists.

Run:

```powershell
npm run typecheck
```

Expected: FAIL with missing module errors for `components/LiveRadar.tsx`.

- [ ] **Step 2: Create the screen contract**

Create `components/live-radar-contract.typecheck.tsx` with a compile-only usage target:

```tsx
import LiveRadar from './LiveRadar';

export function LiveRadarContract() {
  return (
    <LiveRadar
      premium={false}
      membershipAvailable={false}
      status="disabled"
      permissions={{
        foreground: 'unknown',
        background: 'unknown',
        notifications: 'unknown',
      }}
      onboardingVisible={false}
      busy={false}
      currentReading={null}
      history={[]}
      warning={null}
      onBack={() => {}}
      onOpenUpgrade={() => {}}
      onDismissOnboarding={() => {}}
      onStart={() => Promise.resolve()}
      onStop={() => Promise.resolve()}
      onScanNow={() => Promise.resolve()}
      onRequestForeground={() => Promise.resolve()}
      onRequestBackground={() => Promise.resolve()}
      onRequestNotifications={() => Promise.resolve()}
      onToggleReducedAlerts={() => Promise.resolve()}
      onMutePostcode={() => Promise.resolve()}
    />
  );
}
```

- [ ] **Step 3: Implement `components/LiveRadar.tsx`**

Build the screen with:

- back button
- clear `LIVE RADAR` heading
- native/web mode copy split
- onboarding modal with three permission steps
- status card
- the three core actions
- local alert history
- warnings for poor accuracy and API failures
- Pro gate card when background tracking is unavailable

The top-level screen copy must explicitly use:

```tsx
{Platform.OS === 'web'
  ? 'Keep this page open to monitor your current area.'
  : 'Live Radar can watch for higher-risk area changes on this device.'}
```

- [ ] **Step 4: Wire `App.tsx` state, hydration, and navigation**

Add local Live Radar store hydration near the existing AsyncStorage boot logic. Add:

- `LIVE_RADAR_STORAGE_KEY`
- `liveRadarStore`
- `liveRadarPermissions`
- `liveRadarBusy`
- `liveRadarWarning`
- `liveRadarOnboardingVisible`

Extend `Landing`, `Pricing`, and `PremiumDashboard` props with `openLiveRadar`.

Add `LIVE_RADAR` rendering:

```tsx
{appState === 'LIVE_RADAR' && (
  <LiveRadar
    premium={account?.premium === true}
    membershipAvailable={supabaseConfigured}
    // ...state and handlers
  />
)}
```

- [ ] **Step 5: Update entry-point components**

In `components/Landing.tsx`, add a Live Radar feature button next to or near Route Guard with lighter web wording.

In `components/Pricing.tsx`, add a button or section linking to Live Radar as a Pro feature preview.

In `components/PremiumDashboard.tsx`, add a small dashboard tool button such as `Open Live Radar`.

- [ ] **Step 6: Run typecheck**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add App.tsx components/LiveRadar.tsx components/live-radar-contract.typecheck.tsx components/Landing.tsx components/Pricing.tsx components/PremiumDashboard.tsx
git commit -m "feat: add live radar screen and navigation"
```

## Task 4: Manual scans, background loop, and local notifications

**Files:**
- Modify: `components/LiveRadar.tsx`
- Modify: `App.tsx`
- Modify: `live-radar/native-task.ts`
- Modify: `live-radar/permissions.ts`
- Modify: `live-radar/web-session.ts`
- Create or Modify: `live-radar/notifications.ts`
- Create: `live-radar/notifications.test.ts`

**Interfaces:**
- Consumes:
  - `scanLiveRadarCoordinates(...)`
  - `evaluateLiveRadarTransition(...)`
  - `LiveRadarStore` persistence helpers
- Produces:
  - manual scan flow
  - native background activation/deactivation
  - local notification scheduling wrapper
  - web keep-open refresh loop

- [ ] **Step 1: Write failing notification tests**

Create `live-radar/notifications.test.ts` around a pure helper:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildLocalNotificationMessage } from './notifications';

test('formats a high-score live radar alert message', () => {
  const message = buildLocalNotificationMessage({
    postcode: 'SE10 8EP',
    score: 66,
    trigger: 'score-threshold',
    explanation: 'The local score reached 65 or above.',
  });

  assert.match(message.title, /Live Radar/i);
  assert.match(message.body, /SE10 8EP/);
  assert.match(message.body, /66/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test live-radar/notifications.test.ts
```

Expected: FAIL because the notifications helper does not exist yet.

- [ ] **Step 3: Implement manual scan handlers**

In `App.tsx`, add a focused handler:

```ts
const handleLiveRadarScanNow = async () => {
  setLiveRadarBusy(true);
  try {
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const result = await scanLiveRadarCoordinates({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracyMetres: location.coords.accuracy ?? 999,
      checkedAtIso: new Date().toISOString(),
      source: 'manual',
    });
    // normalize store, status, warning, and history
  } finally {
    setLiveRadarBusy(false);
  }
};
```

Manual scan must work even when background permission is missing, as long as foreground permission is granted.

- [ ] **Step 4: Implement background start and stop**

Use the native task module to keep task-specific code isolated. `Turn On Live Radar` should:

- verify Pro entitlement
- verify foreground and background permissions
- verify notification state
- register the task
- persist `enabled: true`

`Turn Off Live Radar` should stop updates and persist `enabled: false`.

- [ ] **Step 5: Implement web Journey Radar loop**

Use `live-radar/web-session.ts` to poll only while the page remains open and the user keeps the feature active. The UI must surface warning banners and not use background-only language on web.

- [ ] **Step 6: Implement local notification formatting and scheduling**

Create `live-radar/notifications.ts` with a pure formatting helper and a scheduling adapter. If notification APIs are unavailable or denied, return a non-throwing result such as `{ delivered: false, reason: 'permission-denied' }`.

- [ ] **Step 7: Run tests and typecheck**

Run:

```powershell
node --test live-radar/notifications.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add App.tsx components/LiveRadar.tsx live-radar/native-task.ts live-radar/permissions.ts live-radar/web-session.ts live-radar/notifications.ts live-radar/notifications.test.ts
git commit -m "feat: add live radar scanning and notifications"
```

## Task 5: Alert history controls, copy updates, and documentation

**Files:**
- Modify: `components/LiveRadar.tsx`
- Modify: `content/faq.ts`
- Modify: `INSTALL.md`
- Modify: `README.md`
- Test: `npm run test`

**Interfaces:**
- Consumes:
  - local history and settings state from prior tasks
- Produces:
  - mute/reduce controls
  - updated FAQ and setup documentation
  - verified final Phase 1 behavior

- [ ] **Step 1: Add reduced-alert and mute flows**

Extend the screen so users can:

- toggle reduced alerts
- mute the current postcode
- still inspect history with a clear explanation for why an alert happened

Persist these settings through `live-radar/storage.ts`.

- [ ] **Step 2: Update FAQ and trust copy**

Add or adjust entries in `content/faq.ts` for:

- native versus web monitoring differences
- local notifications versus emergency warnings
- why background tracking is Pro-only
- what happens when permissions are denied

- [ ] **Step 3: Update install and readme docs**

In `INSTALL.md` and `README.md`, document:

- the three Live Radar actions
- local-first fallback when Supabase is not configured
- web keep-open wording
- the fact that Live Radar is informational and not an emergency service

- [ ] **Step 4: Run full verification**

Run:

```powershell
npm test
```

Expected: PASS.

- [ ] **Step 5: Inspect final branch state**

Run:

```powershell
git status -sb
git log --oneline --max-count=8
```

Expected: only intended commits for the Live Radar Phase 1 work remain on `Macbook`.

- [ ] **Step 6: Commit**

```bash
git add components/LiveRadar.tsx content/faq.ts INSTALL.md README.md
git commit -m "docs: finalize live radar phase one"
```

## Self-Review

- Spec coverage: The plan covers native permissions, onboarding, the three core actions, status card, background cadence, cooldown logic, postcode lookup reuse, local notifications, alert history, Pro gating, and the lighter web Journey Radar wording.
- Placeholder scan: No task uses TBD or TODO placeholders; each task contains explicit files, commands, and representative code shapes.
- Type consistency: The plan consistently uses `LIVE_RADAR`, `LiveRadarSettings`, `LiveRadarReading`, `LiveRadarAlertEvent`, and the same three core actions across all tasks.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-22-riskradar-live-radar-phase-1.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
