# RiskRadar PRO Safety Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a first shippable RiskRadar PRO subscription slice that explains the £15/month value, enforces a free monthly check limit, and adds Safety Session creation/sharing primitives.

**Architecture:** Keep the app useful before full billing integration by adding product copy, FAQ/contact, and server-backed Safety Session records. Use a small subscription module for plan rules, backend JSON persistence for session/share state, and React Native screens wired through the existing `App.tsx` state machine.

**Tech Stack:** Expo React Native, TypeScript, Node.js `http`, Node test runner, JSON state files, existing `apiRequest` client.

## Global Constraints

- Free tier is 3 checks per calendar month.
- PRO is marketed as £15/month, focused on active travel/meetup safety and unlimited checks.
- Contact email is `supr3ltd@gmail.com`.
- Do not claim live news feeds, raw unredacted police logs, verified-safe venues, emergency-service contact, continuous tracking, SMS, or push notifications in this slice.
- Safety Session v1 stores destination, purpose, optional meeting contact, expected end time, trusted email, notes, status, and a revocable expiring share token.
- A missed check-in alert is represented as backend state only until an email provider is configured.
- Existing public crime-data analysis routes remain unchanged.

---

## File Structure

- Create `backend/subscription-rules.mjs`: shared free-limit, plan copy, session purpose, and validation rules for backend tests and routes.
- Create `backend/subscription-rules.test.mjs`: unit tests for monthly usage windows, entitlement checks, and session validation.
- Modify `backend/server.mjs`: add JSON persistence and routes for subscription status plus Safety Session create/list/check-in/share.
- Modify `backend/api-catalog.mjs`: document new public API routes.
- Modify `INSTALL.md`: document new routes and environment notes so documentation tests stay aligned.
- Create `components/Paywall.tsx`: replace the current inline paywall with honest PRO pricing/value copy and FAQ/contact.
- Create `components/SafetySession.tsx`: UI to create, view, and check in from a Safety Session.
- Modify `components/Landing.tsx`: show the free checks remaining and add PRO/Safety Session entry points.
- Modify `App.tsx`: enforce the 3/month local gate, reset usage by month, navigate to PAYWALL/SAFETY_SESSION, and call backend session routes.

### Task 1: Subscription rules and Safety Session validation

**Files:**
- Create: `backend/subscription-rules.mjs`
- Test: `backend/subscription-rules.test.mjs`

**Interfaces:**
- Produces: `FREE_MONTHLY_CHECK_LIMIT`, `PRO_PRICE_GBP_MONTHLY`, `CONTACT_EMAIL`, `getUsageMonthKey(date)`, `buildUsageStatus({ used, monthKey, entitlement })`, `validateSafetySessionInput(input, now)`
- Consumes: none

- [ ] **Step 1: Write the failing tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_MONTHLY_CHECK_LIMIT,
  buildUsageStatus,
  getUsageMonthKey,
  validateSafetySessionInput,
} from './subscription-rules.mjs';

test('free usage status allows exactly three checks per calendar month', () => {
  assert.equal(FREE_MONTHLY_CHECK_LIMIT, 3);
  assert.deepEqual(
    buildUsageStatus({ used: 2, monthKey: '2026-08', entitlement: 'free' }),
    { entitlement: 'free', monthKey: '2026-08', used: 2, limit: 3, remaining: 1, canSearch: true },
  );
  assert.deepEqual(
    buildUsageStatus({ used: 3, monthKey: '2026-08', entitlement: 'free' }),
    { entitlement: 'free', monthKey: '2026-08', used: 3, limit: 3, remaining: 0, canSearch: false },
  );
});

test('pro usage status has unlimited checks', () => {
  assert.deepEqual(
    buildUsageStatus({ used: 99, monthKey: '2026-08', entitlement: 'pro' }),
    { entitlement: 'pro', monthKey: '2026-08', used: 99, limit: null, remaining: null, canSearch: true },
  );
});

test('usage month key is derived in UTC yyyy-mm form', () => {
  assert.equal(getUsageMonthKey(new Date('2026-08-31T23:30:00.000Z')), '2026-08');
});

test('validates the observable Safety Session contract', () => {
  const now = new Date('2026-08-02T10:00:00.000Z');
  const result = validateSafetySessionInput({
    destination: 'SW1A 1AA',
    purpose: 'marketplace',
    meetingContact: 'Facebook Marketplace seller',
    trustedEmail: 'friend@example.com',
    expectedEndAt: '2026-08-02T11:30:00.000Z',
    notes: 'Meet outside the station.',
  }, now);

  assert.equal(result.ok, true);
  assert.equal(result.value.destination, 'SW1A 1AA');
  assert.equal(result.value.purpose, 'marketplace');
  assert.equal(result.value.trustedEmail, 'friend@example.com');
});

test('rejects invalid Safety Sessions before storage', () => {
  const now = new Date('2026-08-02T10:00:00.000Z');
  const result = validateSafetySessionInput({
    destination: '',
    purpose: 'unknown',
    trustedEmail: 'not-an-email',
    expectedEndAt: '2026-08-02T09:59:00.000Z',
  }, now);

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    'Destination is required.',
    'Purpose must be one of marketplace, travel, holiday, date, work, other.',
    'Trusted contact email must be a valid email address.',
    'Expected end time must be in the future.',
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/subscription-rules.test.mjs`

Expected: FAIL with module not found for `backend/subscription-rules.mjs`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/subscription-rules.mjs` with exported constants, month-key generation, free/pro status derivation, and validation that trims strings and returns `{ ok: true, value }` or `{ ok: false, errors }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test backend/subscription-rules.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/subscription-rules.mjs backend/subscription-rules.test.mjs
git commit -m "feat: add subscription rules"
```

### Task 2: Backend Safety Session API

**Files:**
- Modify: `backend/server.mjs`
- Modify: `backend/api-catalog.mjs`
- Modify: `INSTALL.md`
- Test: `backend/safety-sessions.test.mjs`

**Interfaces:**
- Consumes: `validateSafetySessionInput(input, now)` from `backend/subscription-rules.mjs`
- Produces:
  - `GET /api/subscription-status`
  - `POST /api/safety-sessions`
  - `GET /api/safety-sessions`
  - `POST /api/safety-sessions/check-in`
  - `GET /api/safety-session-share`

- [ ] **Step 1: Write failing route tests**

Create `backend/safety-sessions.test.mjs` that spawns `backend/server.mjs` with a temp `RISKRADAR_DATA_DIR`, posts a valid session, verifies the response has `id`, `shareToken`, `shareUrl`, `status: "active"`, lists it, checks it in, verifies status becomes `checked-in`, and fetches a share view that excludes `trustedEmail`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test backend/safety-sessions.test.mjs`

Expected: FAIL with HTTP 404 for `/api/safety-sessions`.

- [ ] **Step 3: Implement session state and routes**

In `backend/server.mjs`, add:

```js
const SAFETY_SESSIONS_ENABLED = process.env.SAFETY_SESSIONS_ENABLED !== 'false';
const SAFETY_SESSIONS_FILE = process.env.SAFETY_SESSIONS_FILE || path.join(DATA_DIR, 'safety-sessions.json');
const SAFETY_SESSION_MAX_ENTRIES = Math.min(1000, Math.max(20, Number(process.env.SAFETY_SESSION_MAX_ENTRIES) || 200));
const safetySessions = [];
```

Add JSON load/write helpers following the existing `searchPresets` pattern. Add route handlers that:

- reject disabled sessions with HTTP 503
- create ids as `session_<timestamp>_<random>`
- create unguessable tokens with `crypto.randomBytes(24).toString('base64url')`
- set `createdAt`, `updatedAt`, `status: "active"`, `alertState: "pending"`
- check in by id and set `status: "checked-in"`, `alertState: "cancelled"`
- expose share view by token without `trustedEmail`

- [ ] **Step 4: Update docs/catalog**

Add each new route to `backend/api-catalog.mjs` and `INSTALL.md`. Include the safety disclaimer: v1 records alert state but does not contact emergency services or send SMS/push.

- [ ] **Step 5: Run tests**

Run: `node --test backend/safety-sessions.test.mjs && npm run test:backend`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/server.mjs backend/api-catalog.mjs INSTALL.md backend/safety-sessions.test.mjs
git commit -m "feat: add safety session api"
```

### Task 3: App paywall, FAQ, and Safety Session UI

**Files:**
- Create: `components/Paywall.tsx`
- Create: `components/SafetySession.tsx`
- Modify: `components/Landing.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: backend routes from Task 2 through `apiRequest`
- Produces: PAYWALL and SAFETY_SESSION app states, honest PRO copy, FAQ/contact, and session create/check-in UI

- [ ] **Step 1: Write a typecheck-driven failing integration target**

Modify `App.tsx` to import `Paywall` and `SafetySession` before creating those files. Run `npm run typecheck`.

Expected: FAIL with missing module errors for the new components.

- [ ] **Step 2: Create `components/Paywall.tsx`**

Implement a React Native component with:

- headline “RiskRadar PRO”
- price “£15/month”
- value copy around unlimited checks, Safety Sessions, trusted-contact share links, saved places, comparisons, and 12-month trends
- FAQ entries covering data limits, missed check-ins, emergency services, trusted-contact visibility, cancellation/support
- contact email `supr3ltd@gmail.com`
- primary button labelled “Start PRO setup”
- back button

- [ ] **Step 3: Create `components/SafetySession.tsx`**

Implement a React Native component with controlled fields for destination, purpose, meeting contact, trusted email, expected end time, notes, create session button, active session card, share link text, check-in button, and disclaimer.

- [ ] **Step 4: Wire app navigation and free usage**

In `App.tsx`:

- add `SAFETY_SESSION` app state
- store usage as `{ monthKey, count }` under `riskradar_usage_v1`
- block free users at 3 successful checks per month
- pass `openPaywall` and `openSafetySession` to Landing
- replace inline PAYWALL view with `Paywall`

- [ ] **Step 5: Update Landing**

Show “Free checks this month: X of 3” and add a “Safety Session” feature button. Add a small PRO card explaining £15/month and linking to the paywall.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add App.tsx components/Landing.tsx components/Paywall.tsx components/SafetySession.tsx
git commit -m "feat: add pro paywall and safety session ui"
```

### Task 4: Final verification and publish

**Files:**
- All changed files

**Interfaces:**
- Consumes: completed Tasks 1-3
- Produces: pushed `Macbook` branch

- [ ] **Step 1: Run full verification**

Run: `npm test`

Expected: PASS.

- [ ] **Step 2: Inspect final diff**

Run: `git status -sb && git log --oneline --max-count=5`

Expected: only intended commits on `Macbook`.

- [ ] **Step 3: Push**

Run: `git push origin Macbook`

Expected: push succeeds. If remote permission fails, report the exact error and leave the branch committed locally.

## Self-Review

- Spec coverage: Free tier, PRO price/value, FAQ/contact, Safety Session create/share/check-in, privacy-safe share view, and deferred provider claims are covered.
- Placeholder scan: No task uses TBD/TODO language for required behavior.
- Type consistency: backend route names and component names are consistent across tasks.
