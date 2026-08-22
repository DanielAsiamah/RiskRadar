# RiskRadar Live Radar Design

## Objective

Add a real Live Radar subsystem to RiskRadar so the product is clearly split
into:

- a useful free website and mobile search experience
- a stronger Pro intelligence layer
- a future mobile-first Live Radar experience worth paying for

Phase 1 must prove the native monitoring loop, permission onboarding,
notification logic, GPS-to-postcode lookup, alert history, and Pro gating
without requiring Supabase to be fully configured first.

## Current Product State

The current codebase already provides:

- public postcode and place search
- current-location postcode suggestions
- map exploration
- compare flows
- Route Guard preview
- Safety Session planning
- a Premium dashboard, reports, pricing, FAQ, privacy, and advertising screens

The largest remaining gap is that there is no real Live Radar subsystem. The
current alert settings are monthly member briefings rather than device-level
location monitoring, and the website does not yet expose a lighter
"keep this page open" monitoring mode.

## Product Split

### Free

Free RiskRadar remains useful without sign-in:

- UK postcode search
- place or location search
- use my current location
- basic risk score out of 100
- risk badge: Low, Moderate, Elevated, High
- latest available data month
- data freshness confidence
- top crime categories
- a short "why this score?" explanation
- bad-postcode validation and no-data fallback
- crime map preview
- compare preview
- recent searches
- methodology, disclaimer, and privacy pages
- on the web, a lightweight Journey Radar session while the page stays open

### Pro

RiskRadar Pro remains the paid intelligence layer:

- unlimited searches
- full compare experience
- saved reports and shareable reports
- dashboard and watchlist
- richer category, trend, and hotspot intelligence
- alert history and "why was I alerted?"
- mute or reduce-alert controls
- no ads
- Live Radar background tracking on native only

### Future Mobile Live Radar

Future versions may add synced alert history, server-backed delivery, deeper
background automation, and account-linked device state, but Phase 1 must not
pretend those features already exist.

## Phase 1 Scope

Phase 1 implements:

- native foreground location permission
- native background location permission
- native notification permission
- a permission onboarding modal
- Turn On Live Radar
- Turn Off Live Radar
- Scan My Current Location Now
- a Live Radar status card
- active or disabled tracking status
- last checked time
- last detected postcode
- current risk score
- main risk reason
- background location task with a 250 metre distance interval
- background location task with a 10 minute time interval
- a 25 minute alert cooldown
- GPS-to-postcode lookup
- local notification alerts
- alerts when entering a higher-risk area
- alerts when score is 65 or above
- alerts when score jumps by 12 or more and the new score is at least 50
- poor GPS accuracy warning
- API failure alert suppression
- basic local alert history
- Pro gating for background tracking
- a website and Safari Journey Radar mode using on-screen banners only

Phase 1 does not implement:

- server-synced Live Radar state
- account-linked multi-device alert history
- SMS, phone calls, or emergency dispatch
- hidden continuous tracking on the web
- claimable guaranteed-safe routing

## User Experience

### Native entry point

The current app navigation gains a dedicated `LIVE_RADAR` screen. This becomes
the product's real-time safety surface. Safety Session remains a separate tool
for planned meetups and trips rather than being overloaded into device
monitoring.

The user can open Live Radar from:

- the home screen as a promoted Pro feature
- pricing as a capability preview
- the dashboard as a member tool

### Native first-run experience

If the user opens Live Radar without Pro, the screen explains the feature and
shows the Pro gate. The user may still read how it works, but cannot enable
background monitoring.

If the user has Pro and has never completed onboarding, Live Radar opens a
permission onboarding modal with three steps:

1. foreground location
2. background location
3. notifications

The copy must be honest:

- foreground location is needed to scan the current area
- background location is needed only for Live Radar monitoring
- notifications are needed only to surface device alerts

The screen must not imply that RiskRadar is an emergency service or that it
sees live police dispatch data.

### Native main actions

The Live Radar screen exposes exactly three core actions:

- `Turn On Live Radar`
- `Turn Off Live Radar`
- `Scan My Current Location Now`

These actions are always visible on native, but `Turn On Live Radar` is
disabled until the required permissions are granted and Pro entitlement is
present.

### Native status card

The top card on Live Radar shows:

- tracking state: `Active` or `Disabled`
- last checked time
- last detected postcode
- current risk score
- risk badge
- main risk reason
- latest data month when known
- a small GPS accuracy note

If the last location reading was poor, the card shows a warning such as
`Location accuracy was low, so this result may be less precise.`

### Native alert history

Phase 1 stores alert history locally on device. Each history row contains:

- timestamp
- postcode
- score
- badge
- trigger reason
- a concise "why was I alerted?" explanation

The trigger explanation must be one of:

- entered a higher-risk area
- score reached 65 or above
- score jumped sharply

### Web and Safari Journey Radar

The web version gets a lighter Journey Radar mode. It must never imply true
background tracking. The wording must explicitly say:

`Keep this page open to monitor your current area.`

The web flow supports:

- current-location scan
- manual refresh
- on-screen warning banners
- a live-looking status panel while the tab remains open

The web flow does not promise background updates after the tab sleeps, closes,
or loses permission.

## Detection Rules

Live Radar evaluates the current postcode or nearby place result and decides
whether to alert.

### Core rules

An alert is eligible when at least one of these conditions becomes true:

1. the user enters a higher-risk area than the most recent accepted reading
2. the score is 65 or above
3. the score increases by at least 12 points and the new score is at least 50

### Cooldown

After an alert is sent, further alerts are suppressed for 25 minutes unless
the user manually scans. Manual scans may still update the UI and history but
must not spam notifications.

### API failure suppression

If the lookup chain fails, Live Radar updates the status with a non-alerting
warning state. It should not generate a danger notification based only on a
request failure.

### Poor accuracy handling

If GPS accuracy is too poor, Live Radar should still allow a manual reading but
mark the result as low-confidence. Background monitoring may skip a reading if
the location is too imprecise to map to a postcode safely.

## Architecture

Phase 1 uses a local-first architecture so it works before Supabase is fully
configured.

### Client modules

The feature is split into focused modules rather than making `App.tsx` carry
all monitoring logic.

Proposed responsibilities:

- `components/LiveRadar.tsx`
  - UI for native and web session monitoring
- `live-radar/types.ts`
  - shared TypeScript contracts
- `live-radar/storage.ts`
  - AsyncStorage persistence for status, settings, and local history
- `live-radar/permissions.ts`
  - foreground, background, and notification permission helpers
- `live-radar/evaluator.ts`
  - score comparison and alert-threshold logic
- `live-radar/notifications.ts`
  - local notification scheduling and cooldown application
- `live-radar/web-session.ts`
  - web-only keep-open session polling
- `live-radar/native-task.ts`
  - native background task registration and processing

### Existing API reuse

Phase 1 reuses existing RiskRadar intelligence routes rather than inventing a
new scoring backend. The location-monitoring path is:

1. get coordinates
2. resolve nearby postcode using the existing location suggestion flow
3. analyze that postcode using the existing backend
4. normalize the response into a compact Live Radar reading
5. evaluate alert rules
6. update status and optionally raise a local notification

### No Supabase dependency

Supabase is optional for Phase 1. The following state is stored locally first:

- onboarding completion
- permission snapshot
- active or disabled monitoring state
- last reading
- last alert timestamp
- alert history
- muted or reduced-alert settings

When Supabase is later configured, this state can be synced or enriched, but
the local workflow remains the fallback.

## State Model

The local store must support at least:

### `LiveRadarSettings`

- `enabled`
- `mode` as `native-background` or `web-session`
- `alertsReduced`
- `mutedPostcodes`
- `lastAlertAt`
- `onboardingCompleted`

### `LiveRadarReading`

- `checkedAt`
- `postcode`
- `score`
- `riskLevel`
- `mainReason`
- `dataMonth`
- `accuracyMetres`
- `accuracyState`
- `source`

### `LiveRadarAlertEvent`

- `id`
- `createdAt`
- `postcode`
- `score`
- `riskLevel`
- `trigger`
- `explanation`
- `notificationSent`

## Native Platform Constraints

RiskRadar currently uses Expo SDK 54 in this repository. Phase 1 must stay
compatible with that project baseline and avoid assuming background-location
behaviour that only works after an unrelated SDK migration.

Background monitoring must be explicit and revocable. The app must not:

- start silently on install
- keep tracking after the user turns it off
- bypass OS permission prompts
- claim accuracy that the device did not provide

If the current Expo package set requires adding a supported notifications or
task-management package, that must be introduced deliberately with matching
tests and documentation.

## Pro Gating

Live Radar background tracking is a Pro feature.

Free users may:

- open the Live Radar preview
- read the onboarding explanation
- use ordinary search and current-location search elsewhere in the app
- use the web keep-open Journey Radar session if product copy allows it

Free users may not:

- turn on native background Live Radar
- receive native background alerts
- access full alert history if the product decides to reserve that for Pro

The gate must be honest and controlled even when Supabase is unavailable. In
that degraded mode, the app should explain that Premium account activation is
still being connected while leaving public search working.

## Dashboard Integration

The Premium dashboard later links to Live Radar summaries, but Phase 1 only
needs lightweight integration:

- a card or entry point into Live Radar
- a count of recent device alerts when history exists
- no fake server-side sync

This keeps the background monitoring subsystem separable from member dashboard
logic.

## Website Business Direction

The website and Safari product structure after Phase 1 should clearly separate:

- search and intelligence
- Journey Radar while open
- Premium upgrade
- reports and ranking
- embed and business features

Future business-facing website features should be structured as:

- embed widget
- allowed-domain protection
- API key per website
- usage limits and usage analytics
- white-label options
- estate-agent embed
- student-accommodation embed
- landlord or renter widget
- monthly business plan

Phase 1 does not need to implement those business controls yet, but the
Journey Radar and embed wording should not conflict with them.

## Trust and Public Pages

To support trust and future O-1 style evidence, the public site structure
should ultimately include:

- about or founder page
- methodology page
- changelog
- press kit
- case studies
- testimonials
- public stats page
- postcodes-analysed counter
- GitHub technical write-up
- open-data explanation
- data limitations page

Phase 1 must at least preserve and expand the existing methodology, privacy,
and disclaimer language rather than weakening it.

## Failure Behaviour

- If foreground permission is denied, manual current-area scan in Live Radar is
  blocked with a readable message.
- If background permission is denied, native background monitoring remains off
  and the user can still use manual scan.
- If notification permission is denied, Live Radar still records local history
  and updates the status card, but it explains that banners cannot be shown.
- If postcode lookup fails, no danger alert is sent; the status is updated with
  a temporary warning instead.
- If data is unavailable, the app shows the existing no-data fallback rather
  than fabricating a score.
- If the app is on the web, background wording is removed and replaced with the
  keep-open session wording.

## Verification

Phase 1 is not complete until evidence exists for:

- TypeScript typecheck passing
- backend tests still passing
- new unit tests covering alert-rule evaluation
- new unit tests covering local storage parsing and cooldown logic
- UI-contract or component tests covering gating and status states where
  practical in this codebase
- manual verification that web copy does not promise background tracking
- manual verification that the three core actions appear correctly
- manual verification that the app behaves sensibly when permissions are denied

## Delivery Sequence

1. Write the Live Radar design and implementation plan.
2. Add shared types, storage, and alert-rule evaluation utilities with tests.
3. Add permission helpers and native or web session abstractions.
4. Build the `LIVE_RADAR` screen and wire navigation from home, pricing, and
   dashboard.
5. Implement manual scan and status-card updates using the existing postcode
   intelligence pipeline.
6. Add background-task registration and local notification flow.
7. Add local alert history and reduced-alert or mute controls.
8. Add lighter web Journey Radar behaviour and wording.
9. Update documentation and verify all affected flows.
