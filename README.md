# RiskRadar

RiskRadar is a free and open-source Expo application for exploring public street-level crime data around UK postcodes, map points, and custom areas.

It combines postcode lookup, UK Police crime feeds, local boundaries, monthly trends, category analysis, hotspot clustering, nearby postcode suggestions, and transparent risk-score explanations in one mobile-first interface.

## Features

- Postcode analysis limited to a local radius rather than an entire city or borough
- Clickable point analysis for map-selected coordinates
- Polygon area analysis for user-defined boundaries
- Six-to-twelve-month crime and category trends
- Hotspot clusters and raw map-ready incident feeds
- Postcode, point, and area comparisons
- Nearby postcode suggestions based on device location
- Saved analyses and reusable search presets
- Conservative, explainable scoring with a deliberately exceptional 50+ band
- Live API mode or imported monthly police CSV snapshots
- Persistent JSON or SQLite backend state
- Rate limiting, retries, request deduplication, caching, and stale-data fallback

## Start locally

Requirements:

- Node.js 22 or newer
- npm
- Expo Go, Android Studio, or an iOS simulator/device for the mobile app

Install once:

```powershell
git clone https://github.com/DanielAsiamah/RiskRadar.git
cd RiskRadar
npm install
```

Start the backend in terminal 1:

```powershell
cd RiskRadar
npm run api
```

Start Expo in terminal 2 and leave the backend terminal running:

```powershell
cd RiskRadar
npm run start
```

The backend listens on `http://0.0.0.0:3001`. Set `EXPO_PUBLIC_API_BASE_URL` when a phone or separately hosted frontend must reach the backend through another hostname.

For a production-style single-service run, export the web app and start the API, then open `http://localhost:3001`:

```powershell
npm run build:web
npm run api
```

## Verify

Run deterministic checks:

```powershell
npm test
```

Run the complete live backend verification:

```powershell
npm run api:verify
```

The live verifier starts a local backend when needed and exercises postcode, point, area, trends, maps, comparisons, caching, readiness, and saved presets.

## Deploy

The repository includes:

- `Dockerfile` for one web app and API service
- `render.yaml` for a Render Blueprint deployment
- `.env.example` for frontend and backend environment settings
- `/health` for diagnostics and `/ready` for deployment readiness

See [INSTALL.md](./INSTALL.md) for complete local, Docker, Render, website embedding, environment, static-data, SQLite, and API instructions. Backend-specific operational notes are in [backend/DEPLOYMENT.md](./backend/DEPLOYMENT.md).

## Data and scoring

RiskRadar requests public data from UK Police, Postcodes.io, and OpenStreetMap-backed geocoding services. Coverage and release timing vary by source and location.

The risk index is an informational local incident-pressure estimate, not an official safety rating. It is postcode-led, uses category and volume thresholds, and exposes its scoring factors in the API response. Public police street data normally groups homicide within violent crime, so a separate homicide increment is only used when an imported source explicitly identifies that category.

Public data, map tiles, Expo template material, and installed dependencies remain subject to their source licences and attribution requirements; the MIT licence below applies to RiskRadar's source code. See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) for attribution details.

## Licence

RiskRadar is released under the [MIT License](./LICENSE).
