# RiskRadar Premium Auth and Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sandbox paywall with passwordless Supabase accounts and a Stripe-verified GBP 8.99 monthly Premium entitlement that unlocks automatically.

**Architecture:** The Expo client owns session UX but never decides Premium status. A focused membership layer in the existing Node `http` server verifies Supabase bearer tokens, signs checkout references, processes Stripe webhooks idempotently, and returns an account view model. Supabase Postgres stores subscription state; Stripe remains the billing source of truth.

**Tech Stack:** Expo SDK 54 website build (implemented against Expo v56-compatible APIs), React Native Web, TypeScript, Supabase Auth/Postgres/RLS, Stripe Payment Links/Webhooks/Customer Portal, Node.js 22 `http`, `node:test`.

## Global Constraints

- Preserve the current RiskRadar white, navy, slate, and indigo visual language.
- Premium costs GBP 8.99 per month and is never unlocked by a client-side flag.
- The configured Stripe Payment Link is `https://buy.stripe.com/cNi28r77pbVJdNU2HkcAo03`.
- Police data and alerts are monthly, not live emergency intelligence.
- Public postcode search must continue working when membership services are unconfigured.
- Never expose Stripe secrets, Supabase service-role keys, webhook secrets, or signed references in logs.
- Keep the current Node `http` server; do not introduce Express.
- Use only `EXPO_PUBLIC_` variables in the client bundle.
- Implement against official Expo v56 documentation while retaining the current SDK until a separately verified upgrade.

---

## File Map

- `supabase/migrations/202607270001_membership.sql`: profiles, subscriptions, billing events, triggers, and RLS.
- `backend/membership/config.mjs`: validates backend membership environment.
- `backend/membership/checkout-reference.mjs`: creates and verifies short HMAC checkout references.
- `backend/membership/subscription-state.mjs`: normalizes Stripe statuses and prevents stale-event regression.
- `backend/membership/supabase-store.mjs`: service-role persistence and bearer-token verification.
- `backend/membership/stripe-billing.mjs`: Stripe webhook, Payment Link URL, and portal adapter.
- `backend/membership/routes.mjs`: membership route dispatcher for the existing server.
- `backend/membership/*.test.mjs`: pure unit tests and adapter tests.
- `auth/storage.ts`: universal Supabase auth storage.
- `auth/client.ts`: configured browser/native Supabase client.
- `auth/AuthProvider.tsx`: session lifecycle and magic-link actions.
- `api/client.ts`: optional bearer token injection and stable membership errors.
- `components/SignIn.tsx`: passwordless email sign-in.
- `components/Pricing.tsx`: Premium value and checkout transition.
- `components/Account.tsx`: entitlement, billing recovery, portal, and logout.
- `components/MembershipUnavailable.tsx`: honest configuration fallback.
- `App.tsx`: navigation and Premium gate orchestration.
- `.env.example`, `render.yaml`, `backend/DEPLOYMENT.md`: configuration contract.

---

### Task 1: Install Membership Dependencies and Define Shared Contracts

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `membership/types.ts`
- Test: `membership/types.typecheck.ts`

**Interfaces:**
- Produces: `MembershipStatus`, `AccountEntitlement`, `MembershipApiErrorCode`, and `PremiumDestination`.

- [ ] **Step 1: Add the client and backend libraries**

Run:

```powershell
npm install @supabase/supabase-js stripe
```

Expected: `package.json` lists both packages and `npm install` exits 0.

- [ ] **Step 2: Create the shared membership contracts**

Create `membership/types.ts` with:

```ts
export type MembershipStatus =
  | 'free'
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceling'
  | 'expired'
  | 'unavailable';

export type PremiumDestination =
  | 'DASHBOARD'
  | 'WATCH_PLACE'
  | 'COMPARE'
  | 'REPORTS';

export type MembershipApiErrorCode =
  | 'AUTH_REQUIRED'
  | 'PREMIUM_REQUIRED'
  | 'BILLING_UNAVAILABLE'
  | 'INVALID_CHECKOUT_REFERENCE';

export interface AccountEntitlement {
  configured: boolean;
  authenticated: boolean;
  email: string | null;
  status: MembershipStatus;
  premium: boolean;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManageBilling: boolean;
}
```

- [ ] **Step 3: Add a compile-only contract fixture**

Create `membership/types.typecheck.ts`:

```ts
import type { AccountEntitlement } from './types';

export const freeAccountFixture: AccountEntitlement = {
  configured: true,
  authenticated: true,
  email: 'member@example.com',
  status: 'free',
  premium: false,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  canManageBilling: false,
};
```

- [ ] **Step 4: Verify dependencies and types**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add package.json package-lock.json membership
git commit -m "chore: add premium membership contracts"
```

### Task 2: Create the Supabase Membership Schema and RLS

**Files:**
- Create: `supabase/migrations/202607270001_membership.sql`
- Create: `supabase/README.md`
- Test: `backend/membership/schema-contract.test.mjs`

**Interfaces:**
- Produces: `public.profiles`, `public.subscriptions`, and `public.billing_events`.
- Produces: `public.handle_new_user()` trigger function.

- [ ] **Step 1: Write the schema contract test**

Create `backend/membership/schema-contract.test.mjs` that reads the migration
and asserts it contains:

```js
const requiredFragments = [
  'create table public.profiles',
  'create table public.subscriptions',
  'create table public.billing_events',
  'alter table public.profiles enable row level security',
  'alter table public.subscriptions enable row level security',
  'stripe_event_id text primary key',
  'on auth.users',
];
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```powershell
node --test backend/membership/schema-contract.test.mjs
```

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Create the migration**

The migration must:

```sql
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  status text not null default 'free',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_event_created_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.billing_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now(),
  processing_result text not null
);
```

Add a trigger on `auth.users` that inserts `profiles` and a default
`subscriptions` row. Enable RLS. Users may select/update their own profile and
select their own subscription; all subscription writes and billing-event
access remain service-role only.

- [ ] **Step 4: Document exact setup**

`supabase/README.md` must state:

```text
1. Create a RiskRadar Supabase project.
2. Run migrations with `supabase db push` or paste the migration into the SQL editor.
3. Add the production and localhost redirect URLs under Auth > URL Configuration.
4. Put only the project URL and anon key in EXPO_PUBLIC variables.
5. Put the service-role key only in the backend environment.
```

- [ ] **Step 5: Run the schema test**

Run:

```powershell
node --test backend/membership/schema-contract.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add supabase backend/membership/schema-contract.test.mjs
git commit -m "feat: add membership database schema"
```

### Task 3: Implement Membership Configuration and Signed Checkout References

**Files:**
- Create: `backend/membership/config.mjs`
- Create: `backend/membership/checkout-reference.mjs`
- Test: `backend/membership/config.test.mjs`
- Test: `backend/membership/checkout-reference.test.mjs`

**Interfaces:**
- Produces: `readMembershipConfig(env): MembershipConfig`.
- Produces: `createCheckoutReference({ userId, expiresAt }, secret): string`.
- Produces: `verifyCheckoutReference(reference, secret, now): { userId, expiresAt }`.

- [ ] **Step 1: Write failing configuration tests**

Cover:

```js
assert.equal(readMembershipConfig({}).configured, false);
assert.equal(readMembershipConfig({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  STRIPE_SECRET_KEY: 'sk_test_value',
  STRIPE_WEBHOOK_SECRET: 'whsec_value',
  STRIPE_PREMIUM_PRICE_ID: 'price_123',
  STRIPE_PAYMENT_LINK_URL: 'https://buy.stripe.com/test',
  BILLING_REFERENCE_SECRET: 'a-long-random-secret',
}).configured, true);
```

Assert that public configuration responses expose only `configured` and the
Payment Link host, never secret values.

- [ ] **Step 2: Write failing checkout-reference tests**

Cover valid round trip, tampering, expiration, malformed payload, wrong secret,
and a maximum lifetime of 15 minutes.

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
node --test backend/membership/config.test.mjs backend/membership/checkout-reference.test.mjs
```

Expected: FAIL because modules do not exist.

- [ ] **Step 4: Implement configuration**

`readMembershipConfig` returns:

```js
{
  configured,
  supabaseUrl,
  supabaseServiceRoleKey,
  stripeSecretKey,
  stripeWebhookSecret,
  stripePremiumPriceId,
  stripePaymentLinkUrl,
  billingReferenceSecret,
  webAppUrl,
}
```

`configured` is true only when all required billing fields are non-empty and
the URLs parse as HTTPS, except `http://localhost` is allowed for `WEB_APP_URL`
outside production.

- [ ] **Step 5: Implement signed references**

Use Node `crypto.createHmac('sha256', secret)` over a base64url payload:

```js
{ "sub": "<supabase-user-uuid>", "exp": 1785147000 }
```

Return `v1_<payload>_<signature>`. Stripe Payment Link references allow only
alphanumeric characters, dashes, and underscores, so dots are forbidden.
Parse the fixed 43-character SHA-256 base64url signature from the end rather
than splitting on underscores that can occur inside base64url. Verify with
`timingSafeEqual`, UUID format, expiration, and the 15-minute lifetime.

- [ ] **Step 6: Run tests**

Run:

```powershell
node --test backend/membership/config.test.mjs backend/membership/checkout-reference.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/membership
git commit -m "feat: secure premium checkout references"
```

### Task 4: Implement Subscription State and Supabase Store Adapters

**Files:**
- Create: `backend/membership/subscription-state.mjs`
- Create: `backend/membership/supabase-store.mjs`
- Test: `backend/membership/subscription-state.test.mjs`
- Test: `backend/membership/supabase-store.test.mjs`

**Interfaces:**
- Consumes: `MembershipConfig` from Task 3.
- Produces: `toEntitlement(subscription, configured): AccountEntitlement`.
- Produces: `shouldApplyStripeEvent(currentCreatedAt, incomingCreatedAt): boolean`.
- Produces: `createSupabaseMembershipStore(config, fetchImpl)`.

- [ ] **Step 1: Write failing entitlement tests**

Assert:

- `active` and `trialing` are Premium.
- `cancel_at_period_end=true` remains Premium and becomes `canceling`.
- `past_due`, `unpaid`, `incomplete_expired`, `canceled`, and missing rows are
  not Premium.
- unconfigured services return `status: 'unavailable'`.
- an older Stripe event cannot replace a newer stored state.

- [ ] **Step 2: Write failing store adapter tests**

With a fake `fetchImpl`, verify:

- `verifyAccessToken(token)` calls
  `${SUPABASE_URL}/auth/v1/user` with `apikey` and `Authorization: Bearer`.
- `getSubscription(userId)` filters `user_id=eq.<uuid>`.
- `getSubscriptionByStripeCustomer(customerId)` and
  `getSubscriptionByStripeSubscription(subscriptionId)` use exact filters and
  return at most one row.
- `upsertSubscription(row)` uses service-role authorization and
  `Prefer: resolution=merge-duplicates`.
- `claimBillingEvent(event)` inserts once and reports duplicates without
  throwing.

- [ ] **Step 3: Run tests to verify failure**

Run:

```powershell
node --test backend/membership/subscription-state.test.mjs backend/membership/supabase-store.test.mjs
```

Expected: FAIL.

- [ ] **Step 4: Implement pure subscription state**

Export:

```js
export function toEntitlement(subscription, configured) {}
export function shouldApplyStripeEvent(currentCreatedAt, incomingCreatedAt) {}
export function normalizeStripeSubscription(subscription, userId, eventCreatedAt) {}
```

Normalize Stripe epoch seconds to ISO strings and return camelCase only at the
API boundary.

- [ ] **Step 5: Implement the Supabase REST store**

Use an injected `fetchImpl` and a single `request(path, options)` helper.
Throw `MembershipStoreError` containing HTTP status and a safe message.
Never include response bodies containing tokens in the error text.

- [ ] **Step 6: Run tests**

Run:

```powershell
node --test backend/membership/subscription-state.test.mjs backend/membership/supabase-store.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/membership
git commit -m "feat: persist premium subscription state"
```

### Task 5: Implement Stripe Billing and Idempotent Webhooks

**Files:**
- Create: `backend/membership/stripe-billing.mjs`
- Test: `backend/membership/stripe-billing.test.mjs`

**Interfaces:**
- Consumes: signed references, subscription normalization, Supabase store.
- Produces: `createStripeBilling({ config, store, stripe })`.
- Produces methods: `buildCheckoutUrl(user)`, `createPortalUrl(user, returnUrl)`,
  and `processWebhook(rawBody, signature)`.

- [ ] **Step 1: Write failing Payment Link tests**

Assert `buildCheckoutUrl`:

- creates a 15-minute signed `client_reference_id`;
- adds `prefilled_email`;
- preserves existing Payment Link query parameters;
- never includes a service or Stripe secret.

- [ ] **Step 2: Write failing webhook tests**

Using a fake Stripe adapter and in-memory store, cover:

- invalid signature rejected before parsing;
- `checkout.session.completed` verifies the signed reference;
- purchased line items must contain `STRIPE_PREMIUM_PRICE_ID`;
- the Supabase user ID comes only from the verified reference;
- subscription/invoice events without a checkout reference resolve the user
  only through a previously stored Stripe customer or subscription ID;
- event IDs are processed once;
- `invoice.paid` preserves active access;
- `invoice.payment_failed` records `past_due`;
- `customer.subscription.deleted` revokes access;
- an older event does not regress newer state.

- [ ] **Step 3: Write failing portal tests**

Assert a portal session is created only when the authenticated account has a
stored Stripe customer ID, and the return URL must match `WEB_APP_URL`.

- [ ] **Step 4: Run tests to verify failure**

Run:

```powershell
node --test backend/membership/stripe-billing.test.mjs
```

Expected: FAIL.

- [ ] **Step 5: Implement billing adapter**

Instantiate `new Stripe(config.stripeSecretKey)` in production wiring, but
accept an injected `stripe` object in tests. Use:

```js
stripe.webhooks.constructEvent(rawBody, signature, config.stripeWebhookSecret)
stripe.checkout.sessions.listLineItems(sessionId)
stripe.subscriptions.retrieve(subscriptionId)
stripe.billingPortal.sessions.create({ customer, return_url })
```

Store `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`,
`status`, `current_period_end`, `cancel_at_period_end`, and event creation time.

- [ ] **Step 6: Run tests**

Run:

```powershell
node --test backend/membership/stripe-billing.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/membership/stripe-billing.mjs backend/membership/stripe-billing.test.mjs
git commit -m "feat: verify Stripe premium billing"
```

### Task 6: Add Authenticated Membership Routes to the Existing Server

**Files:**
- Create: `backend/membership/routes.mjs`
- Modify: `backend/server.mjs`
- Modify: `backend/api-catalog.mjs`
- Test: `backend/membership/routes.test.mjs`
- Modify: `backend/documentation.test.mjs`

**Interfaces:**
- Consumes: `createSupabaseMembershipStore`, `createStripeBilling`.
- Produces: `createMembershipRouteHandler(dependencies)`.
- Handles: `GET /api/account`,
  `POST /api/billing/checkout-reference`,
  `POST /api/billing/customer-portal`,
  `POST /api/billing/webhook`.

- [ ] **Step 1: Write route-handler tests**

Use lightweight fake request/response objects and assert:

- unconfigured `GET /api/account` returns 200 with `status: unavailable`;
- missing bearer token returns 401 `AUTH_REQUIRED`;
- valid free user returns 200 with `premium: false`;
- checkout returns 503 `BILLING_UNAVAILABLE` when unconfigured;
- checkout returns `{ checkoutUrl }` for a valid user;
- portal requires a Stripe customer ID;
- webhook requires `stripe-signature` and passes raw bytes unchanged.

- [ ] **Step 2: Run tests to verify failure**

Run:

```powershell
node --test backend/membership/routes.test.mjs
```

Expected: FAIL.

- [ ] **Step 3: Implement the route dispatcher**

Expose:

```js
const handled = await membershipRoutes.handle(request, response, url);
if (handled) return;
```

The webhook route must call a bounded `readRawBody` helper before generic JSON
parsing. All other membership routes use the existing JSON response shape and
private `Cache-Control: no-store`.

- [ ] **Step 4: Wire routes before public API routes**

Initialize membership dependencies once near server startup. If configuration
is absent, keep public routes healthy and return honest membership-unavailable
responses.

- [ ] **Step 5: Add API catalog entries**

Document method, path, authentication, response, and error codes for all four
routes. Update `documentation.test.mjs` expectations.

- [ ] **Step 6: Run backend tests**

Run:

```powershell
npm run test:backend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend
git commit -m "feat: expose premium account and billing API"
```

### Task 7: Add Universal Supabase Session Handling

**Files:**
- Create: `auth/storage.ts`
- Create: `auth/client.ts`
- Create: `auth/AuthProvider.tsx`
- Create: `auth/useAuth.ts`
- Modify: `index.ts`
- Modify: `.env.example`
- Test: `auth/auth-contract.typecheck.ts`

**Interfaces:**
- Produces: `AuthProvider`.
- Produces: `useAuth(): { session, user, loading, signInWithEmail, signOut }`.
- Produces: `getAccessToken(): Promise<string | null>`.

- [ ] **Step 1: Add compile-only auth fixtures**

The fixture imports `useAuth`, calls `signInWithEmail('member@example.com')`,
and confirms `getAccessToken()` returns `Promise<string | null>`.

- [ ] **Step 2: Implement universal storage**

Use `globalThis.localStorage` on web and the existing `AsyncStorage` package on
native. The adapter implements:

```ts
getItem(key: string): Promise<string | null>
setItem(key: string, value: string): Promise<void>
removeItem(key: string): Promise<void>
```

- [ ] **Step 3: Implement Supabase client**

Read:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_WEB_APP_URL
```

When missing, export `supabaseConfigured=false` and do not construct a client
with fake values.

- [ ] **Step 4: Implement provider and callback recovery**

`signInWithEmail` uses:

```ts
supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${webAppUrl}?auth=callback` },
});
```

Subscribe to `onAuthStateChange`, restore the session, and expose a stable
loading state. Parse callback tokens only through Supabase APIs.

- [ ] **Step 5: Mount the provider**

Wrap `<App />` in `<AuthProvider>` in `index.ts`.

- [ ] **Step 6: Add public env documentation**

Add only the three `EXPO_PUBLIC_` values above. Explicitly state that the anon
key is publishable and the service-role key is backend-only.

- [ ] **Step 7: Run typecheck and web export**

Run:

```powershell
npm run typecheck
npm run build:web
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add auth index.ts .env.example
git commit -m "feat: add passwordless RiskRadar accounts"
```

### Task 8: Add Bearer Authentication to the API Client

**Files:**
- Modify: `api/client.ts`
- Create: `api/membership.ts`
- Test: `api/client.typecheck.ts`

**Interfaces:**
- Consumes: `getAccessToken`.
- Produces: `apiRequest<T>(path, options, timeoutMs, authMode?)`.
- Produces: `getAccount`, `beginCheckout`, and `openCustomerPortal`.

- [ ] **Step 1: Extend `ApiError`**

Add:

```ts
constructor(
  message: string,
  readonly status = 0,
  readonly code: string | null = null,
) {}
```

Parse backend `code` without changing existing public request behavior.

- [ ] **Step 2: Add optional auth mode**

The fourth argument is `'none' | 'optional' | 'required'`, defaulting to
`'none'`. For optional/required calls, inject:

```ts
Authorization: `Bearer ${token}`
```

If required and no token exists, throw `ApiError` with code `AUTH_REQUIRED`
without sending the request.

- [ ] **Step 3: Add membership API wrappers**

```ts
export function getAccount(): Promise<AccountEntitlement>;
export function beginCheckout(): Promise<{ checkoutUrl: string }>;
export function openCustomerPortal(): Promise<{ portalUrl: string }>;
```

- [ ] **Step 4: Verify types**

Run:

```powershell
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add api
git commit -m "feat: authenticate premium API requests"
```

### Task 9: Build Sign-In, Pricing, and Account Screens

**Files:**
- Create: `components/SignIn.tsx`
- Create: `components/Pricing.tsx`
- Create: `components/Account.tsx`
- Create: `components/MembershipUnavailable.tsx`
- Create: `components/membershipStyles.ts`
- Modify: `App.tsx`
- Modify: `components/Landing.tsx`

**Interfaces:**
- Consumes: auth provider and membership API wrappers.
- Produces screens for `SIGN_IN`, `PRICING`, and `ACCOUNT`.
- Produces: `requirePremium(destination: PremiumDestination): Promise<void>`.

- [ ] **Step 1: Replace the old paywall copy contract**

Remove:

```text
Unlock PRO
raw unredacted police logs
Sandbox mode: Bypass paywall
```

No screen may claim unredacted logs.

- [ ] **Step 2: Build `SignIn`**

Include email validation, magic-link sent state, retry, back navigation, and:

```text
Your areas. Always remembered.
Email me a secure sign-in link
Continue as a free visitor
```

- [ ] **Step 3: Build `Pricing`**

Show GBP 8.99/month, six approved benefits, monthly data disclaimer, Stripe
checkout button, and cancel-at-any-time wording. A signed-out click first saves
`pendingPremiumDestination` and opens sign-in.

- [ ] **Step 4: Build `Account`**

Render free, active, canceling, past-due, expired, confirming, and unavailable
states. Include `Manage billing`, `Restore membership`, and `Sign out`.

- [ ] **Step 5: Implement checkout return behavior**

On `?billing=success`, open Account and poll `GET /api/account` every two
seconds for at most 20 seconds. Stop immediately when `premium=true`; otherwise
show a non-blocking `Still confirming` action.

- [ ] **Step 6: Enforce three successful free searches**

Reset the local counter by calendar date. On the fourth successful search
attempt, route to pricing. Signed-in Premium users bypass the local product
limit but still use backend rate limits.

- [ ] **Step 7: Add entry points without redesigning Landing**

Add compact `Sign in` or `Premium active` access near existing secondary
actions. Preserve current search, nearby suggestions, map, comparison, spacing,
and colors.

- [ ] **Step 8: Run typecheck and export**

Run:

```powershell
npm run typecheck
npm run build:web
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add App.tsx components
git commit -m "feat: launch RiskRadar premium account experience"
```

### Task 10: Add Production Configuration and End-to-End Safeguards

**Files:**
- Modify: `.env.example`
- Modify: `render.yaml`
- Modify: `backend/DEPLOYMENT.md`
- Create: `backend/membership/production-readiness.mjs`
- Test: `backend/membership/production-readiness.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `checkMembershipReadiness(env): { ready, errors }`.
- Produces script: `npm run membership:check`.

- [ ] **Step 1: Write failing readiness tests**

Cover missing values, placeholder values, non-HTTPS production URLs, too-short
reference secret, wrong Stripe key prefixes, and a complete test-mode setup.

- [ ] **Step 2: Implement the readiness checker**

Required backend variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PREMIUM_PRICE_ID
STRIPE_PAYMENT_LINK_URL
BILLING_REFERENCE_SECRET
WEB_APP_URL
```

Print variable names and remediation only, never values.

- [ ] **Step 3: Add Render secret declarations**

Add each secret with `sync: false`; keep the known Payment Link URL as a normal
value only if desired. Do not put secret test values in `render.yaml`.

- [ ] **Step 4: Document Stripe setup**

Include:

```text
Webhook URL: https://<backend>/api/billing/webhook
Events: checkout.session.completed, customer.subscription.created,
customer.subscription.updated, customer.subscription.deleted, invoice.paid,
invoice.payment_failed
Payment Link after-completion redirect: https://<website>/?billing=success
Customer portal: enable subscription cancellation and payment-method updates
```

- [ ] **Step 5: Add scripts**

```json
"membership:check": "node backend/membership/production-readiness.mjs",
"test:membership": "node --test backend/membership/*.test.mjs"
```

- [ ] **Step 6: Run the complete verification**

Run:

```powershell
npm run typecheck
npm run test:backend
npm run build:web
npm run membership:check
```

Expected: first three PASS. `membership:check` must either PASS with real local
configuration or exit 1 listing only missing variable names.

- [ ] **Step 7: Runtime smoke test**

Start the backend and verify:

```powershell
Invoke-RestMethod http://localhost:3001/ready
Invoke-RestMethod http://localhost:3001/api/account
```

Expected: readiness JSON and an honest unauthenticated/unavailable membership
response, never HTML or a JSON parse error.

- [ ] **Step 8: Commit**

```powershell
git add .env.example render.yaml backend package.json
git commit -m "docs: configure premium billing deployment"
```

### Task 11: Add Safe Account Deletion

**Files:**
- Create: `backend/membership/account-deletion.mjs`
- Modify: `backend/membership/routes.mjs`
- Modify: `backend/membership/supabase-store.mjs`
- Modify: `api/membership.ts`
- Modify: `components/Account.tsx`
- Test: `backend/membership/account-deletion.test.mjs`

**Interfaces:**
- Handles: `DELETE /api/account`.
- Produces: `deleteAccount(): Promise<void>`.

- [ ] **Step 1: Write failing lifecycle tests**

Cover missing auth, an active Stripe subscription blocking deletion with
`ACTIVE_SUBSCRIPTION`, an expired/free account deleting profile-owned records,
Supabase auth deletion occurring last, and a retry after partial failure.

- [ ] **Step 2: Implement backend deletion**

Load subscription state first. If Stripe reports active, trialing, past due, or
canceling access, return HTTP 409 and a customer-portal action. Otherwise delete
the Supabase auth user through the service-role Admin API; foreign-key cascades
remove profile, subscription, watchlist, preferences, and alert history.

- [ ] **Step 3: Implement account UI**

Add `Delete account` behind an in-app confirmation requiring the exact word
`DELETE`. Active subscribers are sent to `Manage billing` instead. On success,
clear the local Supabase session and return Home.

- [ ] **Step 4: Verify and commit**

```powershell
node --test backend/membership/account-deletion.test.mjs
npm run typecheck
npm run build:web
git add backend api components
git commit -m "feat: add safe member account deletion"
```

## Plan Acceptance

This release is complete only when:

- public postcode search still works without Supabase or Stripe;
- passwordless login restores a browser session;
- the fourth free search opens real pricing rather than a sandbox bypass;
- a valid Stripe test checkout activates only the bound Supabase user;
- invalid, duplicate, and stale Stripe events cannot grant or regress access;
- cancellation and payment-failure states render correctly;
- a member can open Stripe's customer portal;
- a non-subscribed member can delete their account and its owned data;
- typecheck, backend tests, and web export pass.
