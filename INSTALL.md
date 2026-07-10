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
- `GET /api/location-suggestions?lat=51.4062&lng=0.0186`
- `GET /health`

## Deployment notes

The backend is designed to be hosted separately from the Expo app and currently:

- caches upstream police and postcode lookups in memory
- filters crimes to a postcode-focused radius around the searched coordinates
- keeps compare requests sequential to reduce public API rate-limit pressure
- exposes raw postcode crime feeds and polygon area crime feeds for future explorer/map features
- exposes clustered hotspot map data for postcode- or polygon-based map views
- exposes reusable monthly crime series data for postcode or area trend graphs

For backend env vars and cache settings, see [backend/DEPLOYMENT.md](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/backend/DEPLOYMENT.md).

## Production recommendation

For a public deployment:

1. Host the Node backend on a small VPS, Render, Railway, Fly.io, or similar.
2. Set `EXPO_PUBLIC_API_BASE_URL` in the Expo environment to the public backend URL.
3. Replace in-memory cache with a persistent/shared cache or stored crime snapshots as traffic grows.
4. Build a web or native release from Expo once the backend URL is stable.
