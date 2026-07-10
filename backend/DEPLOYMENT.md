## Backend Deployment Notes

This backend is a lightweight Node HTTP server that proxies public UK crime and postcode APIs for the Expo app.

### Run locally

```powershell
npm run api
```

### Run in Docker

```powershell
docker build -t riskradar-api .
docker run --rm -p 3001:3001 --env-file .env.example riskradar-api
```

### Render blueprint

The repo includes [render.yaml](C:/Users/china/.gemini/antigravity/scratch/riskradar-expo/render.yaml) so the backend can be deployed as a Render Blueprint web service with `/health` as the health check path.

### Environment variables

- `PORT`
  Backend port. Default: `3001`
- `HOST`
  Bind host. Default: `0.0.0.0`
- `RISKRADAR_DATA_DIR`
  Base directory for persisted backend cache and saved state files. Default: `backend/cache`
- `STATE_DRIVER`
  Backend state persistence mode for snapshots, presets, and analysis cache. Supported values: `json`, `sqlite`. Default: `json`
- `SQLITE_STATE_FILE`
  SQLite database path used when `STATE_DRIVER=sqlite`. Default: `backend/cache/riskradar-state.sqlite`
- `ADMIN_API_KEY`
  Enables protected admin state-management endpoints when set. Default: disabled
- `MAX_REQUEST_BODY_BYTES`
  Maximum JSON request size for standard API routes. Default: `32768`
- `ADMIN_MAX_REQUEST_BODY_BYTES`
  Maximum JSON request size for admin state imports. Default: `2097152`
- `UPSTREAM_TIMEOUT_MS`
  Timeout for public API requests. Default: `15000`
- `UPSTREAM_RETRY_COUNT`
  Extra retry attempts for throttled or flaky upstream responses. Default: `1`
- `UPSTREAM_RETRY_DELAY_MS`
  Base backoff delay between upstream retries in milliseconds. Default: `350`
- `CACHE_TTL_MS`
  Fallback cache TTL for generic upstream responses. Default: `900000`
- `GEOCODE_CACHE_TTL_MS`
  Cache TTL for postcode/geocoding lookups. Default: `86400000`
- `CRIME_CACHE_TTL_MS`
  Cache TTL for police crime responses. Default: `21600000`
- `STALE_IF_ERROR_ENABLED`
  Reuses a recently expired upstream cache entry when the live upstream request times out or is throttled. Default: `true`
- `STALE_CACHE_MAX_AGE_MS`
  Maximum age for stale upstream cache fallback in milliseconds. Default: `604800000`
- `CACHE_MAX_ENTRIES`
  Maximum in-memory upstream cache entries before pruning. Default: `500`
- `CORS_ALLOW_ORIGIN`
  Allowed browser origins, either `*` or a comma-separated list. Default: `*`
- `RATE_LIMIT_ENABLED`
  Enables simple in-memory per-client throttling to protect the public API. Default: `true`
- `RATE_LIMIT_WINDOW_MS`
  Rolling rate-limit window in milliseconds. Default: `60000`
- `RATE_LIMIT_MAX_REQUESTS`
  Maximum requests per client inside the rate-limit window. Default: `180`
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

### Admin state endpoints

When `ADMIN_API_KEY` is configured, the backend exposes protected operational endpoints:

- `GET /api/admin/state-export`
  Returns the current backend state for snapshots, analysis cache, and presets. Add `?includeUpstreamCache=true` only when you explicitly want the full upstream cache export too.
- `POST /api/admin/state-import`
  Accepts an exported state payload plus `mode: "replace"` or `mode: "merge"`.
- `POST /api/admin/state-clear`
  Clears one or more backend stores. Example body:
  ```json
  {
    "upstreamCache": true,
    "analysisSnapshots": false,
    "analysisCache": true,
    "searchPresets": false
  }
  ```

Send the admin key either as `x-api-key: <key>` or `Authorization: Bearer <key>`.

### Storage modes

- `json`
  Keeps the existing file-per-store persistence model and is the default.
- `sqlite`
  Stores analysis snapshots, saved presets, and analysis cache in one SQLite database file while leaving the upstream cache in JSON. This is useful when you want a more database-like deploy path without changing the frontend contract.

SQLite support comes from Node's built-in `node:sqlite` module and is still marked experimental by Node `v22`, so expect an experimental warning when this mode is enabled.

### Why caching matters

The app depends on public upstream services such as:

- `data.police.uk`
- `postcodes.io`
- `nominatim.openstreetmap.org`

Caching helps:

- reduce rate-limit pressure
- improve response times for repeated postcode searches
- make a public deployment more stable under shared traffic
- keep duplicate live requests from stampeding the public upstream APIs
- let the backend serve a recent cached answer when the upstream service is temporarily slow or throttled
- keep useful police snapshot data available after backend restarts when persistent cache is enabled
- keep generated report analyses available after backend restarts when snapshots are enabled
- keep reusable saved search targets available after backend restarts when presets are enabled

### Production note

The backend now supports simple disk-backed upstream caching, stale-cache fallback, upstream request deduping, basic rate limiting, saved analysis snapshots, and saved search presets for one-instance deployments. For broader public deployment, this should eventually move from local disk and in-memory limits to a shared cache or database-backed layer so multiple server instances can reuse upstream results, protect rate limits, and share saved reports and saved targets safely.

The `/health` endpoint now also exposes uptime, request totals, route hit summaries, retry settings, and active rate-limit tracking so production issues can be diagnosed quickly after deployment.
