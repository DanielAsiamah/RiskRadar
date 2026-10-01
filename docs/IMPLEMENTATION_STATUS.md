# RiskRadar Implementation Status

Checkpoint review: 1 October 2026.

The goal remains a working frontend and backend with maps and approach alerts while walking or travelling. A passing test suite alone does not establish that the complete app is ready for a real journey.

## Verified in this checkpoint

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
- The final `npm test` run passed typecheck and 349 tests. The web export and public-credential scanner passed. A 390-pixel browser rendering check verified the unknown badge, missing-data explanation, grey unknown markers, retained elevated marker, and attribution link with no page errors. That rendering check used an isolated test entitlement and synthetic readings; it does not prove subscription activation or GPS delivery.

## Remaining runtime work

- Account access: this checkout has no `.env`. The web app currently shows the PRO gate for Route Guard without a configured account, even though the local route API can execute a scan.
- Public routing capacity: the community service has usage limits and no production uptime guarantee. A multi-process deployment needs shared rate limiting or a self-hosted provider.
- Route performance: public geocoding, routing, and crime feeds can still fail or be slow. The scan client has a 60-second total request deadline. Load and deployment testing remains required; shared upstream requests may finish warming the cache after a risk lookup has returned unavailable.
- Live-source availability: the Environment Agency feed has intermittent failures. The running preview recorded three accepted flood records at its last successful poll on 27 September, but its source status was `stale` on the 28 September check. TfL remains `not-configured` without `TFL_APP_KEY`; the other listed regional providers are not yet connected.
- Transit currently uses a disclosed walking-corridor estimate. Actual public-transport routing remains required for the full transport goal.
- Live incident history remains in memory and is lost when the backend restarts. Durable production storage, ingestion scheduling, and delivery remain unfinished.
- Native installed-build testing is still required for locked-screen alerts, permission revocation, background/foreground handoff, stop-during-refresh, and restart recovery.
- No deployed public API or end-to-end real-device journey has been verified by this checkpoint.

## Local preview

Run from the repository on either macOS or Windows:

```sh
npm run build:web
npm run api
```

Open `http://localhost:3001` on the computer. Keep the API terminal running. This local website does not establish that a phone can reach the backend or receive alerts with its screen locked.
