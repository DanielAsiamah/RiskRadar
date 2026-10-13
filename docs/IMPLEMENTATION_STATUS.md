# RiskRadar Implementation Status

Checkpoint review: 13 October 2026.

The goal remains a working frontend and backend with maps and approach alerts while walking or travelling. A passing test suite alone does not establish that the complete app is ready for a real journey.

## Verified in this checkpoint

- Initial Route Guard scans and live-risk refreshes now include named source health, geography, hazard category, last successful check, and freshness limits. A successful API response no longer implies that its upstream live feeds are available.
- Backend reads age out stale health even when ingestion has stopped. The route screen also rechecks freshness every 30 seconds, with expandable source details and distinct limited/unavailable messaging. This is source-network status, not a claim that every point on the route has coverage.
- Regression tests cover unavailable/malformed metadata, disconnected sources, expiry, preserved known incidents, unchanged historical scores, and saved-journey compatibility. The first full run caught an older-session round-trip regression; it was fixed and the subsequent full suite passed typecheck and 388 tests.
- The final full suite passed all 388 tests again. The web export and credential scanner passed. A real browser run opened the mobile source details and scanned a real route, but its first live refresh returned HTTP 400; the original response body was not retained, so its exact cause is unconfirmed. A repeat passed the real refresh and simulated GPS loss/recovery, off-route movement, rejoining, and stopping with no page errors. That repeat's initial scan had four unavailable risk samples; it did not substitute scores for them.
- The restarted local preview retrieved seven Environment Agency flood records and reported limited England-flood coverage. TfL and other unconnected feeds remained explicitly unavailable. The inspected screenshots show the compact/expanded coverage panel and approach card; some map tiles were still loading. This does not prove physical-device or production delivery.

## Previous checkpoint (11 October 2026)

- `npm run start:local` uses a platform-neutral Node launcher and builds the web export before starting a loopback-only API. It was exercised on this Mac; Windows execution remains unverified. The Route Guard screen uses explicit server-confirmed development access without a fake account or payment. Public routing limits still apply.
- Normal route scans verify the Supabase bearer identity and an active, unexpired subscription belonging to that user. A client-supplied PRO label no longer authorizes a scan. Missing configuration fails closed. Development access is disabled in production and rejects foreign origins, non-loopback peers, unexpected hosts, and forwarded requests.
- Development scans leave the paid client allowance unchanged. Persistent server-side monthly quota accounting is NOT implemented yet.
- A real browser test without an account scanned Waterloo Station to London Bridge Station: 2,156 metres, 80 displayed route points, 12 available risk readings, and no Google request. Foreground tracking, a real API refresh, an on-screen approach alert, and stopping tracking worked with simulated browser geolocation. Desktop and 390-pixel screenshots were inspected; no page errors occurred. This is not an outdoor or locked-screen device test.
- The movement check reproduced a browser GPS bug: a temporary position-unavailable event permanently stopped the watch. Temporary errors now pause approach alerts and hide stale approach scores/distances while retaining the watch; the next fix resumes tracking. Permission denial still stops it. Regression tests cover recovery, stop/late callbacks, and warning presentation. The repeated browser check detected leaving and rejoining the real route without restarting tracking.
- Stripe subscription normalization now accepts item-level billing periods as used by the installed SDK, while retaining older payload compatibility. Regression tests reproduced the previous missing-expiry error before the fix. This does not establish a live payment-to-unlock flow.
- The independent review attempt could not run because of a service usage limit. A direct review and regression checks were performed instead.
- The completed checkpoint suite passed typecheck and 374 tests. The web export and public-credential scan passed. Browser verification used real routing/risk APIs and simulated GPS signal loss, recovery, off-route movement, and rejoining; no account state was injected.

## Earlier verified foundation

- The production web export loads on desktop and at a 390-pixel mobile viewport. The Route Guard entry button opens its screen.
- Route live-risk responses include only contributing public incidents; private evidence is excluded.
- Route markers use the shared severity colours and official-source details. Cleared contributors remove their markers.
- Background route updates retain validated markers. The display keeps the 100 highest-severity markers while all contributors remain in the risk calculation, preventing dense overlays from invalidating a saved session.
- Route changes reset foreground overlays and cancelled polling ignores late responses. Temporary refresh failures preserve the last successful reading.
- Automated checks cover the API, map presentation, approach logic, background storage, credentials, and cross-platform types.
- Walking now selects the dedicated pedestrian routing service rather than labelling a car route as walking. A real Waterloo-to-London-Bridge provider check returned 2,309 metres, 31 minutes, and 232 geometry points. A bounded per-process queue spaces routing requests by at least 1.1 seconds.
- Failed risk samples now remain `null` / `unknown` in the API, map, progress card, and background state. Partial data withholds the overall score rather than substituting 35/100. Unknown samples do not trigger elevated-risk alerts.
- Real routing failures return structured errors and never automatic mock geometry. Explicit mock configuration remains for offline tests only.
- Route scans and refreshes now use a lightweight baseline lookup, without full area-report history or neighbourhood requests. Each baseline lookup has a 10-second response deadline. A real Waterloo-to-London-Bridge scan completed in 12.8 seconds with four unavailable readings; a repeat completed in 6.2 seconds with all twelve readings, followed by a successful 0.5-second risk refresh. These are local observations, not latency guarantees.
- The 1 October `npm test` run passed typecheck and 349 tests. The web export and public-credential scanner passed. A 390-pixel browser rendering check verified the unknown badge, missing-data explanation, grey unknown markers, retained elevated marker, and attribution link with no page errors. That rendering check used an isolated test entitlement and synthetic readings; it does not prove subscription activation or GPS delivery.

## Remaining runtime work

- Account access: this checkout has no `.env`. Local development access now permits computer-only Route Guard testing. Real Supabase/Stripe setup, payment-to-unlock verification, and durable server-side quota enforcement remain required for paid deployment.
- Public routing capacity: the community service has usage limits and no production uptime guarantee. A multi-process deployment needs shared rate limiting or a self-hosted provider.
- Route performance: public geocoding, routing, and crime feeds can still fail or be slow. The scan client has a 60-second total request deadline. Load and deployment testing remains required; shared upstream requests may finish warming the cache after a risk lookup has returned unavailable.
- Refresh reliability: a failed baseline lookup currently rejects the whole live-risk refresh and uses a generic HTTP 400 response. The client preserves the last reading and pauses new alerts, but partial-refresh handling and correct upstream error classification still need implementation.
- Live-source availability: the Environment Agency feed can fail intermittently; consult the source panel rather than treating an empty map as an all-clear. Its coverage is England floods only. TfL remains `not-configured` without `TFL_APP_KEY`; the other listed regional providers are not yet connected. Historical crime data is not a live incident stream.
- Transit currently uses a disclosed walking-corridor estimate. Actual public-transport routing remains required for the full transport goal.
- Live incident history remains in memory and is lost when the backend restarts. Durable production storage, ingestion scheduling, and delivery remain unfinished.
- Native installed-build testing is still required for locked-screen alerts, permission revocation, background/foreground handoff, stop-during-refresh, and restart recovery.
- No deployed public API or end-to-end real-device journey has been verified by this checkpoint.

## Local preview

Run from the repository on either macOS or Windows:

```sh
npm run start:local
```

Open `http://localhost:3001` on the computer, then **Route Guard**. Keep the terminal running. This local mode deliberately does not grant access through a LAN address, tunnel or proxy, and does not establish that a phone can reach the backend or receive alerts with its screen locked. Normal account-gated operation still uses `npm run build:web` followed by `npm run api`.
