## Backend Deployment Notes

This backend is a lightweight Node HTTP server that proxies public UK crime and postcode APIs for the Expo app.

### Run locally

```powershell
npm run api
```

### Environment variables

- `PORT`
  Backend port. Default: `3001`
- `HOST`
  Bind host. Default: `0.0.0.0`
- `UPSTREAM_TIMEOUT_MS`
  Timeout for public API requests. Default: `15000`
- `CACHE_TTL_MS`
  Fallback cache TTL for generic upstream responses. Default: `900000`
- `GEOCODE_CACHE_TTL_MS`
  Cache TTL for postcode/geocoding lookups. Default: `86400000`
- `CRIME_CACHE_TTL_MS`
  Cache TTL for police crime responses. Default: `21600000`
- `CACHE_MAX_ENTRIES`
  Maximum in-memory upstream cache entries before pruning. Default: `500`
- `PERSISTENT_CACHE_ENABLED`
  Enables disk-backed upstream cache reuse across backend restarts. Default: `true`
- `PERSISTENT_CACHE_FILE`
  JSON file used for persisted upstream cache entries. Default: `backend/cache/upstream-cache.json`
- `ANALYSIS_SNAPSHOTS_ENABLED`
  Enables disk-backed saved analysis history across backend restarts. Default: `true`
- `ANALYSIS_SNAPSHOTS_FILE`
  JSON file used for persisted analysis snapshots. Default: `backend/cache/analysis-snapshots.json`
- `ANALYSIS_SNAPSHOT_MAX_ENTRIES`
  Maximum number of saved analysis snapshots retained on disk. Default: `200`
- `ANALYSIS_CACHE_ENABLED`
  Enables disk-backed caching for computed postcode and area analysis results. Default: `true`
- `ANALYSIS_CACHE_FILE`
  JSON file used for persisted computed analysis cache entries. Default: `backend/cache/analysis-cache.json`
- `ANALYSIS_CACHE_MAX_ENTRIES`
  Maximum number of computed analysis cache entries retained on disk. Default: `200`
- `ANALYSIS_CACHE_TTL_MS`
  Cache lifetime for computed analysis results in milliseconds. Default: `7200000`
- `SEARCH_PRESETS_ENABLED`
  Enables disk-backed saved target presets across backend restarts. Default: `true`
- `SEARCH_PRESETS_FILE`
  JSON file used for persisted search presets. Default: `backend/cache/search-presets.json`
- `SEARCH_PRESET_MAX_ENTRIES`
  Maximum number of saved presets retained on disk. Default: `200`

### Why caching matters

The app depends on public upstream services such as:

- `data.police.uk`
- `postcodes.io`
- `nominatim.openstreetmap.org`

Caching helps:

- reduce rate-limit pressure
- improve response times for repeated postcode searches
- make a public deployment more stable under shared traffic
- keep useful police snapshot data available after backend restarts when persistent cache is enabled
- keep generated report analyses available after backend restarts when snapshots are enabled
- keep reusable saved search targets available after backend restarts when presets are enabled

### Production note

The backend now supports simple disk-backed upstream caching, saved analysis snapshots, and saved search presets for one-instance deployments. For broader public deployment, this should eventually move from local disk to a shared cache or database-backed layer so multiple server instances can reuse upstream results, saved reports, and saved targets safely.
