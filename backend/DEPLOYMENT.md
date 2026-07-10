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

### Why caching matters

The app depends on public upstream services such as:

- `data.police.uk`
- `postcodes.io`
- `nominatim.openstreetmap.org`

Caching helps:

- reduce rate-limit pressure
- improve response times for repeated postcode searches
- make a public deployment more stable under shared traffic

### Production note

For broader public deployment, this should eventually move from in-memory cache to a shared cache or database-backed layer so multiple server instances can reuse upstream results.
