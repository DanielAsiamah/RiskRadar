# RiskRadar Premium Alerts and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a monthly member digest and dated, printable reports from watched-place intelligence.

**Architecture:** A secret-protected scheduled route selects active Premium watchlists, refreshes only places with newly published data, computes deterministic changes, and sends one digest per member through an injected email adapter. Reports reuse stored dashboard snapshots and render a private print view in the website.

**Tech Stack:** Node.js 22, Supabase Postgres, Resend HTTP API, Render cron-compatible endpoint, React Native Web, browser print/PDF, `node:test`.

## Global Constraints

- Alerts follow newly published Police.uk months; they are not live warnings.
- Send at most one digest per member per data month.
- Never mark an email sent unless the provider confirms success.
- Scheduled jobs are idempotent, resumable, and protected by `ALERT_JOB_SECRET`.
- Report pages are private, dated, and include source/anonymisation disclaimers.
- A canceled member keeps access only through the paid period from Stripe.

---

### Task 1: Add Alert Preferences and Delivery Schema

**Files:**
- Create: `supabase/migrations/202607270003_alerts.sql`
- Test: `backend/membership/alert-schema.test.mjs`

**Interfaces:**
- Produces: `alert_preferences` and `alert_runs`.

- [ ] **Step 1: Write the failing migration contract test**

Require owner RLS on preferences, backend-only runs, unique
`(user_id, watched_place_id, data_month)`, status constraint, and timestamps.

- [ ] **Step 2: Create migration**

Use:

```sql
create table public.alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_email_enabled boolean not null default true,
  category_change_enabled boolean not null default true,
  volume_change_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
```

`alert_runs` stores watch ID, month, pending/sent/failed/skipped status,
`change_summary jsonb`, provider ID, timestamps, and a safe error.

- [ ] **Step 3: Verify and commit**

```powershell
node --test backend/membership/alert-schema.test.mjs
git add supabase backend/membership/alert-schema.test.mjs
git commit -m "feat: add monthly alert persistence"
```

### Task 2: Implement Alert Preferences API

**Files:**
- Create: `backend/membership/alert-preferences.mjs`
- Modify: `backend/membership/routes.mjs`
- Create: `api/alerts.ts`
- Test: `backend/membership/alert-preferences.test.mjs`

**Interfaces:**
- Handles: `GET/PUT /api/alert-preferences`.
- Produces: `getAlertPreferences()` and `updateAlertPreferences(input)`.

- [ ] **Step 1: Write failing tests**

Cover auth, Premium enforcement, Boolean-only input, default creation, owner
scope, and camelCase responses.

- [ ] **Step 2: Implement routes and client**

Accept only:

```ts
{
  monthlyEmailEnabled: boolean;
  categoryChangeEnabled: boolean;
  volumeChangeEnabled: boolean;
}
```

- [ ] **Step 3: Verify and commit**

```powershell
node --test backend/membership/alert-preferences.test.mjs
npm run typecheck
git add backend api
git commit -m "feat: manage premium alert preferences"
```

### Task 3: Implement the Email Adapter and Digest Renderer

**Files:**
- Create: `backend/membership/email-adapter.mjs`
- Create: `backend/membership/digest-email.mjs`
- Test: `backend/membership/email-adapter.test.mjs`
- Test: `backend/membership/digest-email.test.mjs`

**Interfaces:**
- Produces: `createEmailAdapter(config, fetchImpl)`.
- Produces: `renderMonthlyDigest({ member, places, appUrl }): { subject, html, text }`.

- [ ] **Step 1: Write renderer tests**

Assert escaped labels, data month, total/category changes, dashboard link,
monthly-not-live disclaimer, support email, and a plain-text alternative.

- [ ] **Step 2: Write adapter tests**

With no `RESEND_API_KEY`, `send` returns `{ mode: 'preview', delivered: false }`
and logs only recipient domain plus subject. With configuration, POST to
`https://api.resend.com/emails` and treat only a provider ID as delivered.

- [ ] **Step 3: Implement**

Configuration:

```text
RESEND_API_KEY
ALERT_FROM_EMAIL
ALERT_FROM_NAME=RiskRadar
SUPPORT_EMAIL=supr3ltd@gmail.com
```

- [ ] **Step 4: Verify and commit**

```powershell
node --test backend/membership/email-adapter.test.mjs backend/membership/digest-email.test.mjs
git add backend/membership
git commit -m "feat: render premium monthly briefings"
```

### Task 4: Build the Idempotent Monthly Alert Job

**Files:**
- Create: `backend/membership/monthly-alert-job.mjs`
- Modify: `backend/membership/routes.mjs`
- Test: `backend/membership/monthly-alert-job.test.mjs`

**Interfaces:**
- Produces: `runMonthlyAlertJob({ store, analyzeLocation, email, now })`.
- Handles: `POST /api/jobs/monthly-alerts`.

- [ ] **Step 1: Write failing job tests**

Cover invalid job secret, inactive subscription, disabled preferences, same
month skipped, new month analyzed, one digest for multiple places, partial
Police.uk failure, provider failure, retry after failure, and duplicate
invocation.

- [ ] **Step 2: Implement job**

Process members with concurrency two and places with concurrency two. Claim
alert rows before external calls. Persist snapshots before rendering a digest.
Return counts only:

```js
{ membersChecked, placesUpdated, digestsSent, skipped, failed }
```

- [ ] **Step 3: Add strict route protection**

Require `Authorization: Bearer <ALERT_JOB_SECRET>`, a 32-byte minimum secret,
and no browser CORS allowance for this endpoint.

- [ ] **Step 4: Verify and commit**

```powershell
node --test backend/membership/monthly-alert-job.test.mjs
npm run test:backend
git add backend
git commit -m "feat: send idempotent monthly risk digests"
```

### Task 5: Build Private Report View Models and Routes

**Files:**
- Create: `backend/membership/report-view.mjs`
- Create: `backend/membership/report-routes.mjs`
- Modify: `backend/membership/routes.mjs`
- Create: `api/reports.ts`
- Test: `backend/membership/report-view.test.mjs`
- Test: `backend/membership/report-routes.test.mjs`

**Interfaces:**
- Produces: `buildMemberReport({ place, dashboard, generatedAt })`.
- Handles: `GET /api/reports/:watchId`.
- Produces: `getMemberReport(watchId)`.

- [ ] **Step 1: Write failing report tests**

Require member identity, place label/postcode, generated date, data month,
score method summary, twelve-month series, category changes, hotspot roads,
official evidence references, and disclaimer. Reject non-owner and free users.

- [ ] **Step 2: Implement stable report JSON**

Do not store rendered HTML. Return a bounded JSON view model and
`Cache-Control: private, no-store`.

- [ ] **Step 3: Verify and commit**

```powershell
node --test backend/membership/report-view.test.mjs backend/membership/report-routes.test.mjs
npm run typecheck
git add backend api
git commit -m "feat: serve private premium reports"
```

### Task 6: Add Alert Settings and Printable Report Screens

**Files:**
- Create: `components/AlertSettings.tsx`
- Create: `components/MemberReport.tsx`
- Create: `components/PrintReport.web.tsx`
- Create: `components/PrintReport.native.tsx`
- Modify: `components/PremiumDashboard.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Produces screens: `ALERT_SETTINGS`, `REPORT`.

- [ ] **Step 1: Build alert settings**

Show the signed-in destination email, three approved toggles, latest data-month
explanation, and `Save preferences`. Disable controls while saving and restore
the prior value on failure.

- [ ] **Step 2: Build the report**

Match existing typography/colors. Include a visible generated date, data month,
postcode radius, charts, top roads, evidence links, and informational
disclaimer.

- [ ] **Step 3: Implement browser download**

`PrintReport.web.tsx` opens the report in a print-safe layout and calls
`window.print()`, labelled `Print or save as PDF`. The native file explains
that report download is available on the website rather than failing.

- [ ] **Step 4: Add dashboard actions**

Add `Alert settings` and `Download report` without hiding evidence, map, or
billing actions.

- [ ] **Step 5: Verify and commit**

```powershell
npm run typecheck
npm run test:backend
npm run build:web
git add App.tsx components
git commit -m "feat: add premium alerts and reports"
```

### Task 7: Configure Production Alert Delivery

**Files:**
- Modify: `.env.example`
- Modify: `render.yaml`
- Modify: `backend/DEPLOYMENT.md`
- Modify: `backend/membership/production-readiness.mjs`
- Modify: `backend/membership/production-readiness.test.mjs`

**Interfaces:**
- Adds optional email readiness and required job-secret checks.

- [ ] **Step 1: Add configuration**

Add `ALERT_JOB_SECRET`, `RESEND_API_KEY`, `ALERT_FROM_EMAIL`,
`ALERT_FROM_NAME`, and `SUPPORT_EMAIL`.

- [ ] **Step 2: Document scheduler**

Use a Render cron job or trusted scheduler to POST monthly and again weekly for
safe retries. Include the exact bearer-header format and never place the secret
in the URL.

- [ ] **Step 3: Verify**

```powershell
npm run membership:check
npm run test:backend
npm run build:web
```

Expected: checks pass when configured or list only missing variable names.

- [ ] **Step 4: Commit**

```powershell
git add .env.example render.yaml backend
git commit -m "docs: configure premium alert delivery"
```

## Plan Acceptance

- One new Police.uk month produces at most one digest per member.
- Provider failure remains retryable and is never recorded as delivered.
- Members control alert preferences.
- Reports are owner-only, dated, evidence-linked, and printable to PDF.
- The UI and email both state that information is monthly and non-emergency.
