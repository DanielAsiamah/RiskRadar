# RiskRadar Premium Membership Design

## Objective

Turn the existing RiskRadar website into a recurring safety membership worth
GBP 8.99 per month without replacing its current visual language. Free visitors
can still understand one postcode-level result. Premium members pay for saved
monitoring, longer trends, clearer change explanations, richer evidence,
comparisons, reports, and an ad-free account.

The experience must not claim live police intelligence, exact crime addresses,
real-time GPS surveillance, or emergency warnings. Police.uk publishes
anonymised records by recorded month, so RiskRadar alerts when a newly published
month changes the available evidence.

## Approved Product Direction

RiskRadar Premium is a **Safety Membership** rather than a larger one-off crime
lookup.

The recurring value is:

- Remember the places a member cares about.
- Recalculate those places as new official monthly data appears.
- Explain what changed instead of only showing another score.
- Preserve evidence, comparison, and reporting tools in one personal dashboard.
- Remove advertising for paying members.

## Free Experience

Free visitors receive:

- Three successful postcode searches per calendar day.
- The latest postcode-level score with its data month and approximate radius.
- Top crime categories and a simplified incident map.
- A concise explanation of how the score was produced.
- Transparent Police.uk source and anonymisation wording.
- One clearly labelled local sponsor placement where appropriate.

The free limit is a product prompt, not a security boundary. Public analysis
routes retain ordinary abuse rate limits. A signed-in Premium entitlement is
required for protected member routes.

## Premium Experience

GBP 8.99 per month unlocks:

- Unlimited interactive postcode searches, subject to fair-use API protection.
- Up to ten named watched places such as Home, Work, Family, or University.
- A monthly safety briefing when a new Police.uk data month is available.
- A `What changed?` view comparing the newest month with prior months.
- Twelve-month total and category trend graphs.
- Rich hotspot, road, cluster, and representative official-evidence exploration.
- Comparison of up to five areas.
- Downloadable, dated reports.
- Alert preferences and billing management.
- No sponsor placements.

Premium status is always derived from verified billing state on the backend,
never from a client-side flag.

## Account Experience

Supabase provides passwordless email magic-link authentication.

1. A visitor can search without an account until the free daily allowance is
   reached.
2. Watching a place, opening a Premium tool, or choosing Premium asks the user
   to sign in.
3. Supabase emails a secure magic link.
4. The returning user resumes the intended screen instead of losing context.
5. The account screen shows `Free`, `Premium active`, `Payment issue`,
   `Cancels on DATE`, or `Expired` using backend entitlement data.

Client code uses only the Supabase project URL and anonymous publishable key.
The service-role key remains server-side.

## Stripe Billing and Automatic Unlock

Stripe remains the payment processor and source of truth. The existing
subscription Payment Link can be retained, but RiskRadar first requests a
signed checkout reference from its backend. The browser opens the GBP 8.99
Payment Link with that reference and the signed-in email.

The reference binds checkout to the authenticated Supabase user and prevents a
client from assigning a purchase to an arbitrary account.

The Stripe webhook:

- Reads the raw request body before JSON parsing.
- Verifies the `Stripe-Signature` header with `STRIPE_WEBHOOK_SECRET`.
- Accepts relevant checkout, subscription, and invoice events idempotently.
- Verifies that the purchased recurring product/price is the configured
  RiskRadar Premium subscription.
- Stores Stripe customer and subscription identifiers against the user.
- Grants access after successful checkout/payment.
- Preserves access until the paid period ends when cancellation is scheduled.
- Revokes access after cancellation, expiration, or an unpaid terminal state.

The webhook handles at least:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Stripe's customer portal is opened through an authenticated backend endpoint so
members can update payment details or cancel without emailing support.

No Stripe secret, Supabase service-role key, or webhook secret is exposed in the
Expo bundle. Secrets are configured independently for RiskRadar rather than
copied from another project.

## Data Model

Supabase Postgres stores:

### `profiles`

- `user_id` UUID primary key referencing `auth.users`
- `email`
- `created_at`
- `updated_at`

### `subscriptions`

- `user_id` UUID unique
- `stripe_customer_id` unique
- `stripe_subscription_id` unique
- `stripe_price_id`
- `status`
- `current_period_end`
- `cancel_at_period_end`
- `last_event_created_at`
- `updated_at`

### `watched_places`

- `id` UUID
- `user_id`
- `label`
- `postcode`
- `normalized_postcode`
- `last_checked_month`
- `last_snapshot` JSONB
- `created_at`
- `updated_at`

The database enforces a maximum of ten watched places for active Premium users.

### `alert_preferences`

- `user_id` UUID unique
- `monthly_email_enabled`
- `category_change_enabled`
- `volume_change_enabled`
- `updated_at`

### `alert_runs`

- `id`
- `user_id`
- `watched_place_id`
- `data_month`
- `status`
- `change_summary` JSONB
- `sent_at`
- `error`

### `billing_events`

- `stripe_event_id` primary key
- `event_type`
- `processed_at`
- `processing_result`

Row Level Security lets users read and edit only their own profile, watchlist,
and preferences. Subscription writes, billing events, and automated alert
writes are backend-only.

## Dashboard

The member dashboard preserves the current white, navy, slate, and indigo
RiskRadar style.

Its first view contains:

- A membership badge and account menu.
- A monthly briefing headline such as `Home is cooling overall`.
- A plain-language comparison with the prior three-month baseline.
- Watched-place cards with the newest data month and direction.
- A twelve-month chart for the selected place.
- Category movements such as violent crime slightly rising or ASB cooling.
- A `What changed?` evidence section.
- Actions for watchlist, report download, alerts, and billing.

Loading remains fast and honest. Existing scanner motion is reused for fresh
analysis; the dashboard uses restrained skeletons rather than replaying the
full scanner for cached member data.

## Monthly Monitoring

A protected scheduled backend job:

1. Finds Premium watched places whose stored month is older than the latest
   available Police.uk month.
2. Reuses the existing analysis pipeline and caches.
3. Stores a compact snapshot and calculates changes against the prior snapshot.
4. Sends one digest per member rather than one email per postcode.
5. Records success or failure idempotently in `alert_runs`.

The initial email provider is configurable through a small adapter. Production
uses Resend when `RESEND_API_KEY` and a verified sender are configured. Local
development logs a preview and does not pretend an email was delivered.

The scheduled endpoint requires a separate job secret and can be invoked by a
Render cron job or another trusted scheduler.

## FAQ and Support

The website adds a navigable FAQ covering:

- How the score is calculated.
- Why postcode results can differ from city reputation.
- Data recency and Police.uk publication delays.
- Approximate roads, anonymised points, and evidence limitations.
- What Premium includes.
- Why alerts are monthly rather than live emergency warnings.
- How to sign in, cancel, update payment details, and restore access.
- How companies can enquire about advertising.
- How to report a data or billing problem.

Customer support and business enquiries use
`mailto:supr3ltd@gmail.com`.

## Advertising

Advertising is limited to clearly labelled sponsor placements on free pages.

- Advertising never influences risk scores, category ordering, trends, maps,
  evidence, or editorial wording.
- Premium screens contain no advertising.
- The initial business flow is enquiry-first at `supr3ltd@gmail.com`.
- Approved advertisers receive a separate Stripe invoice or business payment
  link; the consumer Premium link is never reused.
- RiskRadar can reject misleading safety claims and unsuitable categories.
- Sponsored content includes a visible `Sponsored local business` label.

Self-service ad purchasing is deliberately deferred until audience size,
placement inventory, moderation, and pricing are proven.

## Navigation

The existing lightweight screen-state model gains:

- `SIGN_IN`
- `PRICING`
- `ACCOUNT`
- `DASHBOARD`
- `WATCH_PLACE`
- `FAQ`
- `ADVERTISE`

Premium-only actions preserve a pending destination, authenticate if necessary,
check entitlement, and then either continue or open pricing. Browser refresh
and Stripe return URLs restore meaningful routes through a small URL-state
adapter instead of dropping the user on the home screen.

## Backend API

New authenticated routes:

- `GET /api/account`
- `POST /api/billing/checkout-reference`
- `POST /api/billing/customer-portal`
- `POST /api/billing/webhook`
- `GET /api/watchlist`
- `POST /api/watchlist`
- `PATCH /api/watchlist/:id`
- `DELETE /api/watchlist/:id`
- `GET /api/dashboard`
- `GET /api/reports/:watchId`
- `GET /api/alert-preferences`
- `PUT /api/alert-preferences`
- `POST /api/jobs/monthly-alerts`

Bearer tokens are verified against Supabase. Protected endpoints then load the
server-side subscription record and enforce Premium status before returning
member data.

API errors remain JSON with stable error codes such as `AUTH_REQUIRED`,
`PREMIUM_REQUIRED`, `WATCH_LIMIT_REACHED`, and `BILLING_UNAVAILABLE`.

## Failure Behaviour

- A missing Supabase configuration leaves public RiskRadar searches working and
  shows member features as temporarily unavailable.
- A missing Stripe configuration disables checkout with a readable message; it
  never grants sandbox access in production.
- Duplicate or out-of-order webhooks do not duplicate subscriptions or regress
  a newer billing state.
- A successful checkout returning before its webhook shows `Confirming
  membership` and polls entitlement briefly.
- Payment failure shows a billing-recovery action without deleting watchlists.
- Police.uk or email-provider failure records an alert error and retries safely.
- Cancelled users keep access through the paid period displayed by Stripe.

## Privacy and Security

- Location suggestions remain a one-time browser permission action. Continuous
  GPS tracking is not part of the website release.
- RiskRadar stores watched postcodes only for signed-in users who explicitly add
  them.
- Logs redact bearer tokens, magic links, Stripe signatures, and secret values.
- Webhook and scheduled-job routes have tighter body limits and rate rules.
- Reports and dashboard responses use private cache headers.
- Account deletion removes RiskRadar profile, watchlist, preferences, and local
  alert history after checking billing state.

## Repository Transition

The current GitHub repository is public and distributed under MIT. Making
future development private and replacing the project licence prospectively
cannot revoke the MIT rights already granted to people who obtained earlier
copies.

Repository visibility is changed only after a separate explicit confirmation
because GitHub warns that public forks remain public, stars/watchers are
affected, and GitHub Pages or security features can change. Third-party
licences and notices remain intact even if RiskRadar's own future source becomes
proprietary.

## Delivery Sequence

1. Add Supabase client configuration, SQL migrations, magic-link session state,
   and authenticated API helpers.
2. Add entitlement-safe Stripe checkout reference, webhook processing,
   customer portal, and account status.
3. Replace the static sandbox paywall with sign-in, pricing, confirming, and
   account states.
4. Add watchlists and the member dashboard using the existing intelligence
   pipeline.
5. Add twelve-month trends, comparisons, report output, and change summaries.
6. Add alert preferences, monthly job, email adapter, and delivery history.
7. Add FAQ, support, and advertising enquiry pages.
8. Remove all sandbox bypasses and validate production-safe fallback states.
9. Configure Supabase, Stripe, Resend, Render secrets, webhook URL, and scheduler.
10. After explicit confirmation, make the GitHub repository private and update
    RiskRadar's prospective licence/readme wording.

## Verification

- TypeScript typecheck and Expo web export pass.
- Existing backend tests continue to pass.
- Unit tests cover entitlement rules, signed checkout references, webhook
  signature handling, idempotency, subscription status transitions, watchlist
  ownership/limits, and alert change calculations.
- Integration tests cover magic-link session restoration, Premium gating,
  successful checkout confirmation, cancellation, payment failure, and portal
  creation with Stripe/Supabase adapters mocked.
- Browser smoke tests cover free search, fourth-search paywall, sign-in,
  pricing, FAQ, advertising enquiry, dashboard, watchlist, and logout.
- A Stripe test-mode event proves automatic unlock and cancellation behaviour
  before production keys are configured.
- A production-readiness check fails when required secrets, webhook URL, price
  identity, or alert sender configuration is missing.
