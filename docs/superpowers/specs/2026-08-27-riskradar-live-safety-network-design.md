# RiskRadar Live Safety Network Design

## Approval and Purpose

This design records the approved Option A launch direction: London live
transport and road disruptions plus England-wide Environment Agency flood
warnings. National Highways support is designed now and activated after a
server-side API key is available.

The finished product remains the full RiskRadar product already defined in
the Free, Pro, website, Mobile Live Radar, business, and trust roadmap. This
design adds the shared live-incident layer underneath those experiences. It
does not replace the existing historical crime analysis or narrow the wider
product goal.

The objective is to make RiskRadar respond to changing real-world conditions
without pretending that monthly Police.uk records are live emergency data.
The core equation is:

`historical baseline + active incident impact + current time + route exposure = live RiskRadar score`

## Product Truths

RiskRadar must maintain these truths in code and copy:

- Police.uk street-level crime remains the historical baseline. It is
  monthly, anonymised, and must never be labelled as a live dispatch feed.
- A `LIVE` label requires an active source observation with a source timestamp,
  a current lifecycle state, and a source-health check that has not gone stale.
- Every public live incident exposes its provider, source link when available,
  first-seen time, last-updated time, confidence label, and location precision.
- RiskRadar is area intelligence, not an emergency service and not a guarantee
  that a place or route is safe.
- RiskRadar never invents exact addresses, victims, suspects, causes, or
  resolution details that are absent from the source.
- A route may be described as lower exposure or lower reported risk. It must
  not be called safe or guaranteed safe.
- Source failure is displayed as source unavailability, never as proof that no
  incidents exist.

## Approved Initial Coverage

### Environment Agency

The first keyless real adapter ingests current flood alerts and warnings for
England from the Environment Agency Flood Monitoring API. The source updates
its flood-warning feed every 15 minutes and supplies stable flood-area IDs,
severity, timestamps, messages, and links to flood-area geometry.

The adapter polls no faster than every 15 minutes, uses conditional requests
when supported, and maps warning withdrawal to the resolving and resolved
states rather than deleting history.

### Nation-by-Nation Flood Coverage

The Environment Agency feed applies to England. RiskRadar must not describe it
as UK-wide flood coverage. Public source status and map legends show coverage
separately for England, Wales, Scotland, and Northern Ireland.

Natural Resources Wales and the Scottish Environment Protection Agency are
the official warning authorities for Wales and Scotland. Northern Ireland uses
different public flood-information arrangements. Their live adapters are
enabled only after RiskRadar verifies a stable machine-readable source,
licence, update cadence, geometry, and attribution requirements for each
nation. Until then, those nations display `live flood feed not yet connected`
rather than an empty-incident claim.

### Transport for London

The London adapter ingests current TfL road and transport disruptions. It is
enabled only when server-side TfL credentials are configured. Missing
credentials produce a visible `not configured` source state; they do not
produce fixtures or fake London incidents in production.

The adapter follows TfL rate limits and terms, retains the TfL source ID and
link, and treats TfL-provided severity and location as structured official
evidence.

### National Highways

The National Highways adapter contract is included in the architecture for
planned and unplanned road and lane closures on England's strategic road
network. The adapter remains disabled until a National Highways subscription
and API key are configured on the backend. The key is never included in the
Expo bundle or any browser response.

### Historical Police Data

Police.uk data continues to provide postcode-level historical crime context,
category trends, hotspot evidence, and the baseline score. It is not passed
through the live incident ingestion pipeline.

## System Boundary

The network is split into four deliverable systems that share one canonical
incident model:

1. **Live incident core** ingests, normalises, geocodes, deduplicates,
   classifies, versions, and publishes incidents.
2. **Realtime client layer** shows active incidents and score changes on web
   and mobile while respecting platform capability.
3. **Route impact layer** intersects current and alternative route corridors
   with active incidents and historical baseline samples.
4. **Alert delivery layer** finds eligible nearby devices, applies user
   preferences and cooldowns, and sends server-originated push notifications.

The first implementation plan starts with the live incident core and one real
Environment Agency adapter. Subsequent plans consume that core for TfL,
Supabase persistence, map updates, push delivery, and real routing. Those later
systems remain required parts of this design rather than optional ideas.

## End-to-End Data Flow

1. A scheduled ingestion run asks each enabled adapter for changes since its
   last successful cursor or source timestamp.
2. The raw response is validated against a provider-specific schema and saved
   as an immutable source observation with a payload hash.
3. The normaliser maps provider fields to the canonical category, severity,
   timestamps, location, and source evidence contracts.
4. The geocoder accepts official coordinates or polygons first. Text
   geocoding is a fallback and records its precision and confidence.
5. The deduplicator links the observation to an existing incident or creates a
   new incident using provider IDs, category, time window, geometry overlap,
   and text similarity.
6. The publication policy calculates confidence and decides whether the
   incident is public, preliminary, review-only, or rejected.
7. A changed public incident creates an immutable incident version and an
   outbox event in the same transaction.
8. Realtime, risk-overlay, route-impact, and push workers consume the outbox
   event idempotently.
9. Later source observations update the same incident until it is resolved,
   retracted, or expired by policy.

No ingestion request waits for a mobile or browser client. The server-side
pipeline continues independently at all hours when deployed.

## Canonical Data Model

### Source Observation

Each immutable observation contains:

- `id`
- `provider`
- `providerTier`
- `externalId`
- `sourceUrl`
- `capturedAt`
- `sourcePublishedAt`
- `sourceUpdatedAt`
- `payloadHash`
- `rawPayload`
- `schemaVersion`
- `ingestionRunId`
- `validationState`
- `validationErrors`

Raw payloads are private backend evidence. Public clients receive only the
normalised, allow-listed fields.

### Canonical Incident

Each incident contains:

- `id` and stable `fingerprint`
- `category` and `subcategory`
- `title` and concise factual `summary`
- `status`
- `publicationState`
- `verificationLevel`
- numeric `confidence` from 0 to 1
- `severity` from 1 to 5
- `geometry` as a point, line, or polygon
- `centroid`
- `locationLabel`
- `locationPrecision`
- `affectedRadiusMetres`
- `firstObservedAt`
- `sourceOccurredAt`
- `lastObservedAt`
- `resolvedAt`
- `expiresAt`
- `primarySourceObservationId`
- `independentSourceCount`
- `currentVersion`
- `createdAt` and `updatedAt`

### Incident Version

Every public change creates an append-only version containing the incident
snapshot, changed fields, reason, source observation IDs, confidence-policy
version, risk-policy version, and timestamp. Retractions remain visible to the
audit system and replace the public state with an explicit retracted notice.

### Outbox Event

Outbox events use a unique incident-version key and contain the event type,
incident ID, version, creation time, delivery attempts, next-attempt time, and
completion state. This prevents database success followed by lost realtime or
push delivery.

## Incident Categories

The initial canonical categories are:

- `flood`
- `road-collision`
- `road-closure`
- `transport-disruption`
- `fire`
- `hazardous-material`
- `severe-weather`
- `police-activity`
- `violent-incident`
- `public-safety`
- `other`

Only categories supported by an enabled source appear live. The broader list
keeps the contract stable for future official, licensed, and corroborated
sources.

## Lifecycle

Canonical status transitions are:

`detected -> corroborating -> active -> updated -> resolving -> resolved`

An incident may also move to `retracted` from any non-resolved state when the
source withdraws or disproves it.

- `detected` is an internal valid observation that has not passed publication.
- `corroborating` needs another trusted source or human decision.
- `active` is currently affecting an area and is eligible for risk impact.
- `updated` records a material change and behaves as active.
- `resolving` means impact is reducing but has not fully expired.
- `resolved` is no longer active and contributes no new alert.
- `retracted` is explicitly withdrawn and contributes no risk.

Provider-specific expiry rules prevent abandoned incidents remaining active.
A stale source never silently resolves incidents; it marks them `source stale`
until a provider-specific maximum age is reached, after which they enter
review or policy-driven expiry with an audit reason.

## Confidence and Publication Policy

Confidence is evidence confidence, not a statistical probability that an
incident occurred. The UI displays `Official`, `Corroborated`, `Preliminary`,
or `Unverified` rather than a misleading percentage.

### Provider Tiers

- Tier 1: structured official authority feed with stable IDs and timestamps.
- Tier 2: licensed professional or trusted institutional feed with editorial
  accountability.
- Tier 3: public news, social, or community source with variable verification.
- Tier 4: individual RiskRadar user report.

### Automatic Decisions

- A valid Tier 1 observation with usable location publishes automatically as
  `Official` and may trigger alerts according to severity and proximity.
- Two independent Tier 2 observations that agree on category, time, and
  location publish automatically as `Corroborated`.
- One Tier 2 observation may publish as `Preliminary` when location confidence
  is sufficient. Major push alerts require either corroboration or a policy
  explicitly approved for that provider.
- A single Tier 3 observation may appear only in a review surface or as an
  `Unverified` low-impact map item. It cannot trigger a major push alert or a
  route-avoidance command.
- A Tier 4 report remains private and pending until it is corroborated by an
  independent trusted source or approved by an authorised reviewer.
- An extremely serious uncorroborated claim enters the urgent review queue.
  A preliminary nearby warning is allowed only when the originating provider
  is trusted, location confidence is high, and the copy explicitly says the
  information is preliminary. An anonymous report alone never triggers a mass
  emergency notification.

### AI Boundary

Structured official fields are parsed deterministically. AI may extract
category, location phrases, severity cues, and update relationships from
unstructured trusted text, but it cannot independently establish truth or
raise provider trust.

Every AI result stores model identifier, model version, extraction schema,
prompt version, input hash, output, and confidence. Missing or contradictory
entities route to review. AI failure leaves the observation retryable and does
not publish fabricated fallback content.

## Geocoding and Location Precision

Location is resolved in this order:

1. provider-supplied point, line, or polygon
2. provider-linked official area geometry
3. structured road, station, postcode, or place identifier
4. text geocoding through a server-side geocoder contract

The precision labels are `exact-area`, `road-segment`, `postcode-sector`,
`district`, and `unknown`. `Exact-area` means precise source geometry, not an
assertion that a crime happened at a private address.

Text-only results with district or unknown precision cannot trigger narrow
proximity alerts. Public copy uses `near`, `affecting`, or `reported around`
according to precision and never exposes a private person's address.

## Deduplication

Deduplication uses deterministic evidence before semantic similarity:

1. Same provider plus same stable external ID always updates the same
   observation lineage.
2. Explicit cross-source references join the referenced incident.
3. Matching canonical category, overlapping active time window, and geometry
   inside a category-specific distance threshold produce a candidate match.
4. Normalised road names, place names, and text similarity rank candidates.
5. Ambiguous high-severity candidates remain separate and enter review rather
   than being merged destructively.

Category policies define the time and distance windows. For example, road
collisions use a tighter road-segment and time window than regional floods.
Every merge and split is recorded as an auditable relationship so a mistaken
merge can be repaired without losing source history.

## Dynamic Live Risk

The historical postcode score remains `baselineScore`. Existing transparent
night-time, weekend, student move-in, and Christmas theft rules produce a
separate `contextScore` with named adjustments. Active incidents then add a
temporary, localised impact; they never rewrite historical crime data.

For incident `i` at a point or route sample:

`impact_i = severity_i * confidence_i * distance_i * freshness_i * status_i`

The factors are bounded from 0 to 1:

- severity uses `0.08`, `0.16`, `0.28`, `0.45`, and `0.65` for levels 1 to 5
- confidence uses the publication-policy confidence
- distance uses squared falloff inside the incident's affected radius and is
  zero outside it
- freshness uses category-specific exponential half-life
- status uses `1` for active or updated, a declining value for resolving, and
  `0` for resolved or retracted

Multiple impacts combine without naïve addition:

`combinedImpact = 1 - product(1 - impact_i)`

`liveScore = round(100 - (100 - contextScore) * (1 - combinedImpact))`

This formula prevents several minor reports from immediately forcing a score
to 100 while allowing a severe, current, nearby official incident to create a
large temporary increase. `Unverified` items are capped at a ten-point score
increase and cannot independently produce a `High` label. A preliminary
trusted item is capped at a twenty-point increase until corroborated.

The response always returns every layer and its reasons:

- `baselineScore`
- `contextScore`
- named time and season adjustments
- `liveScore`
- `liveDelta`, defined as `liveScore - contextScore`
- contributing incident IDs
- per-incident contribution
- policy version
- calculated time

When all active impacts expire or resolve, the score decays back to the
current transparent context score rather than dropping abruptly. When the
time or seasonal rule no longer applies, that layer independently returns to
the historical baseline.

## Route Impact and Rerouting

Route Guard will eventually consume real route polylines from a server-side
routing provider. Provider keys remain on the backend.

Each route is sampled at bounded intervals and intersected with active
incident geometries and their affected radii. The route response contains:

- historical sample scores
- active incident intersections
- length and estimated time inside each impact zone
- maximum and exposure-weighted risk
- source confidence for every live contribution
- current route and alternative route comparison

An alternative is labelled `lower reported risk` only when the routing
provider returns a valid route and its exposure is materially lower. The
current mock Route Guard continues to say `planning preview`; it cannot claim
to avoid a live incident or offer a real safer route.

Route recalculation is triggered when a material incident version intersects
an active saved route corridor. The server applies a cooldown and only pushes
an update when the route recommendation changes or the incident severity rises
materially.

## Persistence and Realtime

### Local Development

The live incident core defaults to an in-memory store for tests and local
development. It can ingest real public sources and serve the API without
Supabase, but it clearly reports that history and 24/7 durability are not
configured. Restarting the process clears the development store.

### Production

Production uses Supabase Postgres with PostGIS for geometry, Row Level
Security for account-owned data, and append-only incident evidence tables.
The service role key remains backend-only.

Supabase Cron and Edge Functions may schedule lightweight source polling, or a
separately deployed Node worker may run the same adapter contract. Source locks
and cursors prevent overlapping runs. Secrets are read from server-side
environment configuration or Supabase Vault.

Supabase Realtime Broadcast publishes allow-listed incident-version events.
Clients fetch canonical detail through the RiskRadar API. Realtime is an
acceleration path, not the system of record; clients reconnect by requesting
all changes after their last known version.

## Backend Interfaces

Public endpoints:

- `GET /api/live-incidents?lat={lat}&lng={lng}&radiusKm={radius}` returns
  current public incidents, coverage, and source freshness.
- `GET /api/live-incidents/{id}` returns canonical public detail, versions,
  and source evidence links.
- `POST /api/live-risk` returns baseline and live-overlay calculations for a
  point, postcode, or bounded route samples.
- `GET /api/live-source-status` returns enabled, healthy, stale, disabled, or
  not-configured state for every adapter.

Protected operational endpoints:

- `POST /api/internal/live-ingestion/run` starts an idempotent adapter run.
- `GET /api/internal/live-review` lists observations requiring review.
- `POST /api/internal/live-review/{id}/decision` records an authenticated
  publish, reject, merge, split, resolve, or retract decision.

Internal endpoints require a dedicated scheduler or administrator secret,
constant-time secret comparison, rate limiting, request-size limits, and an
audit record. They are never listed as public app capabilities.

## Alert Delivery

The existing on-device Live Radar rules remain available for local historical
score changes. Server-originated live incident alerts add a separate trigger
type linked to an incident version.

Eligible alerts require:

- a public official, corroborated, or approved preliminary incident
- current source health
- sufficient location precision
- severity and distance threshold
- user entitlement and preferences for the requested feature
- no matching incident-version delivery already recorded
- cooldown and mute rules passing

Push delivery uses an outbox worker and Expo Push Service or direct platform
provider through a server-only adapter. Delivery receipts update the outbox;
invalid tokens are retired. A push contains an incident ID and concise factual
copy, not raw source payloads or sensitive location history.

The notification opens the incident detail screen, where users can see why
they were alerted, source evidence, distance, confidence, and update history.

## Privacy and Location Retention

Web Journey Radar remains foreground-only and says:

`Keep this page open to monitor your current area.`

Native background Live Radar remains explicit, revocable, and Pro-gated. It
never starts silently.

For server-originated proximity alerts, RiskRadar stores at most one current
device location per opted-in device rather than a movement trail. The point is
protected by RLS and service-only access, overwritten on update, and deleted
within 24 hours after monitoring is disabled or becomes stale. Push tokens are
stored separately from public profile data. Users can disable monitoring and
delete device state from the app.

Route corridors are stored only for users who explicitly save or activate a
route and have an expiry time. Public incident data contains no user location
or device identifiers.

## Free, Pro, and Business Placement

### Free

Free users can see official public live incidents, inspect source evidence,
run a current-location foreground scan, and receive on-screen warnings while
the website remains open. Safety-critical public incident existence is not
hidden behind payment.

### Pro

Pro adds native background monitoring, push alerts, custom alert radius,
alert history, mute and reduced-alert controls, live route impact, route
recalculation, saved routes, report integration, and the wider existing Pro
intelligence suite.

### Business

The same canonical public incident API later powers allowed-domain embeds,
per-site API keys, usage limits, analytics, white-label widgets, and property
or accommodation products. Business access never exposes private device
locations, review queues, or raw source payloads.

## Client Experience

The existing visual language remains: light map, navy text, indigo baseline
intelligence, amber caution, and red current high impact. The live layer adds
motion only where it communicates state:

- a subtle pulse for newly active incidents
- a fixed marker for established active incidents
- a fading ring while an incident resolves
- no pulse for historical Police.uk crime dots

Incident cards show `LIVE`, `PRELIMINARY`, `UPDATED`, `RESOLVING`, or
`RESOLVED`, plus age, distance, confidence label, and provider. The UI uses
`reported` rather than stating allegations as proven facts.

The map may show historical dots and live incidents together, but the legend,
marker shape, and layer controls must make them unmistakably different.

## Failure and Degraded Behaviour

- Invalid provider JSON is quarantined and does not publish.
- A timeout retries with bounded exponential backoff and jitter.
- A stale source displays its last successful time and stops claiming the
  layer is current.
- Geocoding failure keeps the observation in review and suppresses proximity
  alerts.
- AI extraction failure suppresses publication rather than generating a
  fallback incident.
- Conflicting trusted sources preserve both observations and mark the incident
  disputed or review-required.
- Supabase failure leaves public historical RiskRadar working and may use the
  development memory store only outside production.
- Realtime disconnect falls back to bounded polling while the page is open.
- Push failure does not change incident truth and is retryable through the
  outbox.
- Routing-provider failure leaves the current route visible without claiming
  that no lower-risk route exists.

## Security and Abuse Controls

- All provider secrets and routing keys are backend-only.
- Adapter URLs are fixed allow-listed origins to prevent SSRF.
- Provider responses have byte, time, redirect, and schema limits.
- Internal routes require authenticated operational roles and audit every
  decision.
- Public queries enforce radius, result-count, and rate limits.
- User report uploads are deferred until moderation, content safety, retention,
  and legal processes are implemented.
- Published copy excludes names and identifying details unless a public
  authority source explicitly requires their display for a legitimate public
  safety purpose and the product policy permits it.

## Observability

Each adapter reports:

- last attempt and last success
- source watermark
- HTTP status and latency
- observations fetched, accepted, rejected, and unchanged
- incidents created, updated, resolved, and retracted
- deduplication matches and review count
- outbox lag and delivery failures

The readiness endpoint distinguishes historical search readiness from live
network readiness. A live-source outage does not take down postcode search,
but the UI receives a machine-readable degraded reason.

## Testing Strategy

The implementation uses test-first development and includes:

- provider fixture tests for valid, changed, withdrawn, malformed, and
  oversized responses
- canonical normalisation and schema tests
- lifecycle transition tests, including illegal transitions
- confidence and publication matrix tests
- deterministic deduplication tests and ambiguous-match review tests
- geocoding precision and suppression tests
- dynamic-risk formula boundary, decay, cap, and multi-incident tests
- memory and Supabase store contract tests
- outbox idempotency and retry tests
- public and internal API tests
- source-health and stale-data tests
- client contract tests for live versus historical labels
- build secret scanning to prove provider keys are absent from web bundles
- end-to-end smoke tests against recorded official fixtures

Live upstream APIs are checked separately from deterministic unit tests so a
provider outage cannot make the standard test suite flaky.

## Delivery Sequence

### Phase 2A: Live Incident Core

- canonical contracts and lifecycle
- publication policy and deterministic risk overlay
- in-memory store
- Environment Agency adapter using real current data
- public incident, source-status, and live-risk endpoints
- API catalogue and operational documentation

### Phase 2B: Durable Realtime Network

- Supabase/PostGIS migration
- durable store, source cursors, locks, versions, and outbox
- scheduled ingestion
- Realtime Broadcast
- TfL adapter and source-health dashboard
- National Highways adapter disabled until credentials are configured

### Phase 2C: Live Map and Journey Radar

- active-incident map layer and legend
- detail and update timeline
- baseline versus live score presentation
- foreground web updates and banners
- mobile foreground updates

### Phase 2D: Push and Background Delivery

- device registration and short-retention current location
- server push outbox worker
- incident-version deduplication, preferences, mute, and cooldown
- why-was-I-alerted evidence
- native development-build verification

### Phase 2E: Real Route Intelligence

- server-side routing provider adapter
- real route polyline sampling
- active incident intersections
- lower-reported-risk alternative comparison
- reroute notifications and route update history

### Phase 2F: Moderated Community and Commercial Surfaces

- user reporting only after moderation and legal controls
- corroboration and reviewer tools
- business incident embeds and API access
- public live-network statistics and methodology evidence

## Phase 2A Acceptance Criteria

Phase 2A is accepted only when:

- the app ingests at least one real, enabled official source without requiring
  a client-side secret
- source observations are immutable and idempotent
- incidents update and resolve through the canonical lifecycle
- duplicate source observations do not create duplicate incidents
- official, preliminary, unverified, and rejected states follow the policy
- the live score returns baseline, contextual adjustments, delta,
  contributors, and policy version
- stale or failed sources are disclosed and never represented as no incidents
- the existing public app still works when Supabase is absent
- API documentation, methodology, limitations, and disclaimers are updated
- typecheck, backend tests, Live Radar tests, build guards, and web export pass
- a production bundle contains no provider, Supabase service-role, Stripe, or
  routing secret

## References

- Citizen public process: https://support.citizen.com/hc/en-us/articles/115000278894-How-does-Citizen-work
- Citizen incident criteria: https://support.citizen.com/hc/en-us/articles/115000603373-What-is-Citizen-s-criteria-for-reporting-incidents
- Police.uk data provenance and monthly frequency: https://data.police.uk/about/
- Environment Agency real-time flood API: https://environment.data.gov.uk/flood-monitoring/doc/reference
- TfL Unified API: https://tfl.gov.uk/info-for/open-data-users/unified-api
- National Highways developer portal: https://developer.data.nationalhighways.co.uk/
- Expo SDK 56 Location: https://docs.expo.dev/versions/v56.0.0/sdk/location/
- Expo SDK 56 Notifications: https://docs.expo.dev/versions/v56.0.0/sdk/notifications/
- Expo SDK 56 TaskManager: https://docs.expo.dev/versions/v56.0.0/sdk/task-manager/
- Supabase Realtime: https://supabase.com/docs/guides/realtime
- Supabase scheduled Edge Functions: https://supabase.com/docs/guides/functions/schedule-functions
