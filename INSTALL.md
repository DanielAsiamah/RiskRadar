# RiskRadar Install And Deploy

This project is an Expo app with a lightweight Node backend that proxies public UK crime and postcode APIs.

## Requirements

- Node.js 20 or newer
- npm
- Expo Go on a phone, or an Android/iOS simulator

## Local install

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm install
```

## Run locally

Open two terminals.

Terminal 1:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api
```

Terminal 2:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run start
```

Optional:

```powershell
npm run android
```

Smoke-test the backend after it boots:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:smoke
```

Check which crime-data provider the backend is using:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:crime-source-check
```

Summarize imported local snapshot coverage:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:crime-dataset-summary
```

Inspect score-calibration bands from imported snapshot data:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:crime-score-calibration
```

Wait for readiness and then run the full smoke check:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:verify
```

`npm run api:verify` now auto-starts the local backend on `127.0.0.1:3001` if it is not already running, so it can be used as a one-command local backend verification pass.

## Backend public deploy

### Option 1: Docker

Build the backend image from the repo root:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
docker build -t riskradar-api .
```

Run it locally or on any VPS/container host:

```powershell
docker run --rm -p 3001:3001 --env-file .env.example riskradar-api
```

Health check:

```powershell
curl http://127.0.0.1:3001/health
```

Readiness check:

```powershell
curl http://127.0.0.1:3001/ready
```

### Option 2: Render

This repo now includes [render.yaml](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/render.yaml) for the backend service.

1. Create a new Render Blueprint from this repository.
2. Set `CORS_ALLOW_ORIGIN` to your real frontend origin or app web host.
3. Deploy the `riskradar-api` service.
4. Copy the live backend URL into `EXPO_PUBLIC_API_BASE_URL` for your Expo environment.
5. Set `RISKRADAR_SMOKE_BASE_URL` to that backend URL and run `npm run api:smoke` as a release sanity check.
6. Optionally set `RISKRADAR_PREWARM_BASE_URL` and run `npm run api:prewarm` to warm common backend responses immediately after deploy.
7. Check `/health` after prewarm to confirm `analysisCache.stats` and scoped unified endpoint cache activity are moving as expected.

### Environment template

Use [.env.example](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/.env.example) as the starting point for production configuration.

`MONTHLY_FETCH_CONCURRENCY` controls how many historical police-data months are requested at once. The default is `2`, and the backend enforces a range of `1` to `4` to avoid overwhelming the public API. Trend responses include `dataQuality` plus `dataAvailable` on every monthly point; failed months are excluded from trend calculations instead of being treated as zero-crime months.

### Storage mode

The backend now supports two state persistence modes:

- `STATE_DRIVER=json`
  Default mode using JSON files in `RISKRADAR_DATA_DIR`
- `STATE_DRIVER=sqlite`
  Stores upstream cache, snapshots, saved presets, and analysis cache in one SQLite database file defined by `SQLITE_STATE_FILE`

SQLite mode keeps the same frontend/API contract and passed local restart testing here, but Node `v22` still marks `node:sqlite` as experimental.

If you are switching an existing backend from `json` to `sqlite`, leave `SQLITE_BOOTSTRAP_FROM_JSON=true` for the first boot. That lets the backend import the current JSON upstream cache, snapshots, presets, and analysis-cache data into SQLite automatically when the database is still empty.

### Crime data source mode

The backend can now serve crime records from either:

- `CRIME_SOURCE_MODE=api`
  Default mode. Crimes are requested live from `data.police.uk`.
- `CRIME_SOURCE_MODE=files`
  Reads local UK police monthly street-level CSV snapshots from `CRIME_DATA_ROOT`.

This is useful if you want a faster or more deployable public setup that is less dependent on the live upstream police API.

Expected local file layout:

```text
backend/data/police/
  2026-05/
    2026-05-metropolitan-street.csv
    2026-05-city-of-london-street.csv
  2026-04/
    2026-04-metropolitan-street.csv
```

The loader scans recursively for files whose path includes a `YYYY-MM` month and `street.csv`.

Example:

```powershell
$env:CRIME_SOURCE_MODE='files'
$env:CRIME_DATA_ROOT='C:\crime-data-uk'
npm run api
```

If local files are present but incomplete, leave `CRIME_SOURCE_FALLBACK_TO_API=true` so the backend can fall back to the live police API for missing months.

To import downloaded monthly police CSV snapshots into the backend layout:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:import-crime-snapshots -- --source C:\crime-downloads --clean
```

That command scans recursively for `street.csv` files whose path contains a `YYYY-MM` month, copies them into the backend data layout, and writes `manifest.json` inside the target crime-data root.

If you want to import into a different target folder:

```powershell
cd C:\Users\china\.gemini\antigravity\scratch\riskradar-expo
npm run api:import-crime-snapshots -- --source C:\crime-downloads --target C:\crime-data-uk --clean
```

You can also inspect the active provider from:

- `GET /api/crime-source-status`
- `GET /api/crime-dataset-summary`
- `GET /api/crime-score-calibration`
- `GET /health`
  - `storage.crimeSource`

Optional summary query parameters:

- `month=YYYY-MM`
- `monthLimit=6`

### Backend state portability

The backend now supports protected state export/import/clear operations when `ADMIN_API_KEY` is set. This makes it much easier to:

- migrate cache and saved backend state between hosts
- clear only the stores you want after bad or stale data
- inspect what is currently persisted without logging into the machine

Example export:

```powershell
curl -H "x-api-key: YOUR_ADMIN_KEY" http://127.0.0.1:3001/api/admin/state-export
```

Full export including upstream cache only when needed:

```powershell
curl -H "x-api-key: YOUR_ADMIN_KEY" "http://127.0.0.1:3001/api/admin/state-export?includeUpstreamCache=true"
```

## How the app connects

- The Expo front end auto-detects the local dev host and talks to the backend on port `3001`
- You can override the backend base URL with:
  - `EXPO_PUBLIC_API_BASE_URL`
- You can override the backend port with:
  - `EXPO_PUBLIC_API_PORT`

## Backend endpoints

- `POST /api/analyze-postcode`
  - Body:
    ```json
    { "postcode": "BR1 5NN" }
    ```
- `POST /api/analyze-point`
  - Body:
    ```json
    { "lat": 51.431075, "lng": 0.009835, "monthCount": 6 }
    ```
- `POST /api/analyze-area`
  - Body:
    ```json
    {
      "label": "Lewisham Patch",
      "points": [
        { "lat": 51.4280, "lng": 0.0035 },
        { "lat": 51.4365, "lng": 0.0035 },
        { "lat": 51.4365, "lng": 0.0175 },
        { "lat": 51.4280, "lng": 0.0175 }
      ],
      "monthCount": 6,
      "minimumClusterSize": 3,
      "maxClusters": 4
    }
    ```
- `POST /api/compare-postcodes`
  - Body:
    ```json
    { "postcodes": ["BR1 5NN", "SW1A 1AA"] }
    ```
- `POST /api/postcode-intelligence`
  - Body:
    ```json
    {
      "postcode": "BR1 5NN",
      "month": "2026-05",
      "radiusMeters": 900,
      "minimumClusterSize": 2,
      "maxClusters": 4
    }
    ```
  - Returns a bundled postcode-map payload with postcode analysis, postcode-radius crimes, exact-location crimes, hotspot clusters, and nearby postcode suggestions.
- `POST /api/map-intelligence`
  - Body:
    ```json
    {
      "mode": "postcode",
      "postcode": "BR1 5NN",
      "month": "2026-05",
      "radiusMeters": 900,
      "minimumClusterSize": 2,
      "maxClusters": 4
    }
    ```
  - Use `"mode": "point"` with `lat`/`lng`, or `"mode": "area"` with polygon `points`, to access the same bundled intelligence contract for all three explorer modes from one endpoint.
- `POST /api/map-feed`
  - Body:
    ```json
    {
      "mode": "postcode",
      "postcode": "BR1 5NN",
      "month": "2026-05",
      "radiusMeters": 900
    }
    ```
  - Use `"mode": "point"` with `lat`/`lng`, or `"mode": "area"` with polygon `points`, to access the same raw crime-feed contract for all three explorer modes from one endpoint.
- `POST /api/map-compare`
  - Body:
    ```json
    {
      "mode": "postcode",
      "postcodes": ["BR1 5NN", "SW1A 1AA"]
    }
    ```
  - Use `"mode": "point"` with a `points` array, or `"mode": "area"` with an `areas` array, to access the same comparison contract for all three explorer modes from one endpoint.
- Unified explorer endpoints are cached through the persistent analysis cache when `ANALYSIS_CACHE_ENABLED` is enabled, which helps repeated public map requests return faster.
- `/health` now exposes `analysisCache.stats` so you can see hit/miss activity for `analysis`, `map-feed`, `map-intelligence`, and `map-compare`.
- `POST /api/compare-points`
  - Body:
    ```json
    {
      "points": [
        { "lat": 51.431075, "lng": 0.009835, "label": "Anchor point" },
        { "lat": 51.434075, "lng": 0.012835, "label": "Nearby point" }
      ]
    }
    ```
- `POST /api/postcode-crimes`
  - Body:
    ```json
    { "postcode": "BR1 5NN", "radiusMeters": 400, "month": "2026-05", "categories": ["violent-crime"] }
    ```
- `POST /api/point-crimes`
  - Body:
    ```json
    { "lat": 51.431075, "lng": 0.009835, "radiusMeters": 500, "month": "2026-05", "categories": ["violent-crime", "robbery"] }
    ```
- `POST /api/location-crimes`
  - Body:
    ```json
    { "lat": 51.431075, "lng": 0.009835, "month": "2026-05", "categories": ["violent-crime", "robbery"] }
    ```
  - Returns crimes at the nearest mapped street location rather than a radius around the point.
- `POST /api/point-intelligence`
  - Body:
    ```json
    {
      "lat": 51.431075,
      "lng": 0.009835,
      "month": "2026-05",
      "monthCount": 6,
      "radiusMeters": 900,
      "minimumClusterSize": 2,
      "maxClusters": 4
    }
    ```
  - Returns a bundled clickable-map payload with point analysis, exact-location crimes, hotspot clusters, neighbourhood boundary, and nearby postcode suggestions in one request.
- `POST /api/area-crimes`
  - Body:
    ```json
    {
      "points": [
        { "lat": 51.5007, "lng": -0.1246 },
        { "lat": 51.5035, "lng": -0.1246 },
        { "lat": 51.5035, "lng": -0.118 },
        { "lat": 51.5007, "lng": -0.118 }
      ],
      "month": "2026-05",
      "categories": ["robbery", "violent-crime"]
    }
    ```
- `POST /api/area-intelligence`
  - Body:
    ```json
    {
      "label": "Town centre patch",
      "points": [
        { "lat": 51.5007, "lng": -0.1246 },
        { "lat": 51.5035, "lng": -0.1246 },
        { "lat": 51.5035, "lng": -0.118 },
        { "lat": 51.5007, "lng": -0.118 }
      ],
      "monthCount": 6,
      "minimumClusterSize": 2,
      "maxClusters": 4
    }
    ```
  - Returns a bundled area-map payload with polygon analysis, filtered area crimes, hotspot clusters, center point, and nearby postcode suggestions.
- `POST /api/map-hotspots`
  - Body:
    ```json
    { "postcode": "BR1 5NN", "radiusMeters": 900, "month": "2026-05", "categories": ["violent-crime", "robbery"], "minimumClusterSize": 3, "maxClusters": 6 }
    ```
  - Or with an area polygon:
    ```json
    {
      "points": [
        { "lat": 51.4280, "lng": 0.0035 },
        { "lat": 51.4365, "lng": 0.0035 },
        { "lat": 51.4365, "lng": 0.0175 },
        { "lat": 51.4280, "lng": 0.0175 }
      ],
      "month": "2026-05",
      "minimumClusterSize": 3
    }
    ```
- `POST /api/monthly-crime-series`
  - Body:
    ```json
    { "postcode": "BR1 5NN", "radiusMeters": 400, "monthCount": 6, "categories": ["violent-crime", "robbery"] }
    ```
  - Or with an area polygon:
    ```json
    {
      "points": [
        { "lat": 51.4280, "lng": 0.0035 },
        { "lat": 51.4365, "lng": 0.0035 },
        { "lat": 51.4365, "lng": 0.0175 },
        { "lat": 51.4280, "lng": 0.0175 }
      ],
      "monthCount": 6,
      "categories": ["violent-crime", "robbery"]
    }
    ```
- `POST /api/compare-areas`
  - Body:
    ```json
    {
      "areas": [
        {
          "label": "Lewisham Patch A",
          "points": [
            { "lat": 51.4280, "lng": 0.0035 },
            { "lat": 51.4365, "lng": 0.0035 },
            { "lat": 51.4365, "lng": 0.0175 },
            { "lat": 51.4280, "lng": 0.0175 }
          ],
          "monthCount": 6,
          "categories": ["violent-crime", "robbery"]
        },
        {
          "label": "Lewisham Patch B",
          "points": [
            { "lat": 51.4235, "lng": 0.0060 },
            { "lat": 51.4310, "lng": 0.0060 },
            { "lat": 51.4310, "lng": 0.0185 },
            { "lat": 51.4235, "lng": 0.0185 }
          ],
          "monthCount": 6
        }
      ]
    }
    ```
- `GET /api/point-boundary?lat=51.431075&lng=0.009835`
- `GET /api/filter-metadata`
- `GET /api/recent-analyses?type=postcode&limit=10`
- `GET /api/analysis-snapshot?id=<snapshotId>`
- `DELETE /api/analysis-snapshot?id=<snapshotId>`
- `GET /api/search-presets?type=postcode&limit=20`
- `POST /api/search-presets`
  - Body:
    ```json
    { "type": "postcode", "label": "Home", "payload": { "postcode": "BR1 5NN" } }
    ```
- `GET /api/search-preset?id=<presetId>`
- `DELETE /api/search-preset?id=<presetId>`
- `POST /api/run-search-preset`
  - Body:
    ```json
    { "id": "<presetId>", "mode": "analyze" }
    ```
  - Or:
    ```json
    { "id": "<presetId>", "mode": "feed" }
    ```
  - `analyze` now works for saved `postcode`, `point`, and `area` presets.
- `GET /api/location-suggestions?lat=51.4062&lng=0.0186`
- `GET /api/admin/state-export`
- `POST /api/admin/state-import`
- `POST /api/admin/state-clear`
- `GET /health`

## Deployment notes

The backend is designed to be hosted separately from the Expo app and currently:

- caches upstream police and postcode lookups in memory
- dedupes identical live upstream GET requests so repeated searches do not hammer the public APIs
- retries throttled or flaky upstream calls with small backoff before failing
- falls back to a recent cached upstream response when a live upstream request times out or gets throttled
- applies simple per-client rate limiting for safer public deployment
- filters crimes to a postcode-focused radius around the searched coordinates
- keeps compare requests sequential to reduce public API rate-limit pressure
- exposes raw postcode crime feeds and polygon area crime feeds for future explorer/map features
- exposes clustered hotspot map data for postcode- or polygon-based map views
- exposes reusable monthly crime series data for postcode or area trend graphs
- exposes area comparison output with score, trend, and hotspot comparison data
- exposes arbitrary click-point crime feeds and neighbourhood boundary data for map tap workflows
- exposes current month/category filter metadata for explorer controls
- persists generated postcode and area analyses so they can be listed or reopened later
- lets saved analysis snapshots be removed cleanly through the backend API
- persists reusable saved search presets for postcode, point, or area targets
- allows saved presets to be executed directly through the backend
- exposes request, route, cache, retry, and rate-limit metrics through `/health`
- supports protected state export, import, and targeted clearing for safer production operations

For backend env vars and cache settings, see [backend/DEPLOYMENT.md](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/backend/DEPLOYMENT.md).

## Production recommendation

For a public deployment:

1. Host the Node backend on a small VPS, Render, Railway, Fly.io, or similar.
2. Set `EXPO_PUBLIC_API_BASE_URL` in the Expo environment to the public backend URL.
3. Set `CORS_ALLOW_ORIGIN` to your production app origin instead of `*` once the final host is known.
4. Tune `RATE_LIMIT_MAX_REQUESTS` and cache env vars for your traffic profile.
5. Replace in-memory cache with a persistent/shared cache or stored crime snapshots as traffic grows.
6. Build a web or native release from Expo once the backend URL is stable.
