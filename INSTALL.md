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

### Option 2: Render

This repo now includes [render.yaml](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/render.yaml) for the backend service.

1. Create a new Render Blueprint from this repository.
2. Set `CORS_ALLOW_ORIGIN` to your real frontend origin or app web host.
3. Deploy the `riskradar-api` service.
4. Copy the live backend URL into `EXPO_PUBLIC_API_BASE_URL` for your Expo environment.

### Environment template

Use [.env.example](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/.env.example) as the starting point for production configuration.

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
- `POST /api/compare-postcodes`
  - Body:
    ```json
    { "postcodes": ["BR1 5NN", "SW1A 1AA"] }
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
