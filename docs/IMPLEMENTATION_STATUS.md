# RiskRadar Implementation Status

Checkpoint review: 28 September 2026.

The goal remains a working frontend and backend with maps and approach alerts while walking or travelling. A passing test suite alone does not establish that the complete app is ready for a real journey.

## Verified in this checkpoint

- The production web export loads on desktop and at a 390-pixel mobile viewport. The Route Guard entry button opens its screen.
- Route live-risk responses include only contributing public incidents; private evidence is excluded.
- Route markers use the shared severity colours and official-source details. Cleared contributors remove their markers.
- Background route updates retain validated markers. The display keeps the 100 highest-severity markers while all contributors remain in the risk calculation, preventing dense overlays from invalidating a saved session.
- Route changes reset foreground overlays and cancelled polling ignores late responses. Temporary refresh failures preserve the last successful reading.
- Automated checks cover the API, map presentation, approach logic, background storage, credentials, and cross-platform types.
- Walking now selects the dedicated pedestrian routing service rather than labelling a car route as walking. A real Waterloo-to-London-Bridge provider check returned 2,309 metres, 31 minutes, and 232 geometry points. A bounded per-process queue spaces routing requests by at least 1.1 seconds.

## Remaining runtime work

- Account access: this checkout has no `.env`. The web app currently shows the PRO gate for Route Guard without a configured account, even though the local route API can execute a scan.
- Public routing capacity: the community service has usage limits and no production uptime guarantee. A multi-process deployment needs shared rate limiting or a self-hosted provider.
- Full route latency: the first cold route API request did not complete within the caller's deadline. Investigate the historical-risk sampling stage separately from routing and geocoding.
- Missing risk samples currently use a numerical fallback. Replace that with explicit unavailable-data handling before treating reported route scores as dependable.
- Live-source availability: the Environment Agency feed has intermittent failures. The running preview recorded three accepted flood records at its last successful poll on 27 September, but its source status was `stale` on the 28 September check. TfL remains `not-configured` without `TFL_APP_KEY`; the other listed regional providers are not yet connected.
- Upstream route failures can still return a labelled mock fallback. Remove the automatic fallback for real journeys rather than substituting generated geometry when a provider is unavailable.
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
