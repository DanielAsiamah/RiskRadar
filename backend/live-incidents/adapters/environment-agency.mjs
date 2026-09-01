const API_ORIGIN = 'https://environment.data.gov.uk';
const FLOODS_URL = `${API_ORIGIN}/flood-monitoring/id/floods`;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_ATTEMPTS = 2;
const MAX_CONCURRENT_LOOKUPS = 4;
const POLL_INTERVAL_MS = 15 * 60 * 1000;

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function httpsUrl(value) {
  if (typeof value !== 'string') throw new TypeError('official source URL is required');
  const url = new URL(value.replace(/^http:/i, 'https:'));
  if (url.protocol !== 'https:' || url.hostname !== 'environment.data.gov.uk') {
    throw new TypeError('Environment Agency responses must stay on environment.data.gov.uk');
  }
  return url.toString();
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  const explicitTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const timestamp = explicitTimezone ? value : `${value}Z`;
  return new Date(timestamp).toISOString();
}

function latestTimestamp(...values) {
  const valid = values.map(isoOrNull).filter(Boolean);
  if (valid.length === 0) return null;
  return valid.reduce((latest, value) => Date.parse(value) > Date.parse(latest) ? value : latest);
}

function severityFor(level) {
  const result = { 1: 5, 2: 4, 3: 2, 4: 1 }[level];
  if (!result) throw new TypeError(`Unsupported Environment Agency severity level: ${String(level)}`);
  return result;
}

function statusFor(level) {
  return level === 4 ? 'resolving' : 'active';
}

function parsePolygon(payload) {
  const geometry = payload?.features?.[0]?.geometry;
  if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
    throw new TypeError('Environment Agency polygon is missing a Polygon geometry');
  }
  const coordinates = geometry.coordinates.map((ring) => ring.map((coordinate) => {
    if (typeof coordinate === 'string') {
      const values = coordinate.trim().split(/\s+/).map(Number);
      if (values.length !== 2 || values.some((value) => !Number.isFinite(value))) throw new TypeError('Environment Agency polygon coordinate is invalid');
      return values;
    }
    return coordinate;
  }));
  return { type: 'Polygon', coordinates };
}

async function mapWithConcurrency(items, mapper) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_LOOKUPS, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

export function createEnvironmentAgencyAdapter(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const areaCache = new Map();

  async function fetchJson(url, { headers = {}, signal } = {}) {
    const safeUrl = httpsUrl(url);
    let currentUrl = safeUrl;
    let redirects = 0;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const timeoutSignal = signal ?? AbortSignal.timeout(10_000);
        const response = await fetchImpl(currentUrl, {
          method: 'GET', redirect: 'manual', signal: timeoutSignal,
          headers: { accept: 'application/json', ...headers },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= 2) throw new Error('Environment Agency response exceeded redirect limit');
          currentUrl = httpsUrl(response.headers.get('location'));
          redirects += 1;
          attempt -= 1;
          continue;
        }
        if (response.status === 304) return { notModified: true, response };
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(response.headers.get('retry-after'));
            await sleep(Number.isFinite(retryAfter) ? Math.min(5_000, Math.max(0, retryAfter * 1_000)) : Math.round((100 + random() * 100)));
            continue;
          }
          throw new Error(`Environment Agency request failed with HTTP ${response.status}`);
        }
        const body = await response.text();
        if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('Environment Agency response exceeded size limit');
        try {
          return { payload: JSON.parse(body), response };
        } catch {
          throw new Error('Environment Agency response was not valid JSON');
        }
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_ATTEMPTS || !(error?.name === 'AbortError' || error?.name === 'TimeoutError')) break;
        await sleep(Math.round(100 + random() * 100));
      }
    }
    throw lastError;
  }

  async function areaGeometryFor(warning) {
    const floodAreaId = cleanText(warning.floodAreaID, 80);
    if (!floodAreaId) throw new TypeError('Environment Agency warning is missing floodAreaID');
    if (areaCache.has(floodAreaId)) return areaCache.get(floodAreaId);
    const areaUrl = warning.floodArea?.['@id'] ?? `${API_ORIGIN}/flood-monitoring/id/floodAreas/${encodeURIComponent(floodAreaId)}`;
    const areaResult = await fetchJson(areaUrl);
    const area = areaResult.payload?.items ?? areaResult.payload;
    const polygonUrl = area?.polygon ?? warning.floodArea?.polygon;
    if (!polygonUrl) throw new TypeError('Environment Agency flood area is missing polygon URL');
    const polygonResult = await fetchJson(polygonUrl);
    const result = { area, geometry: parsePolygon(polygonResult.payload) };
    areaCache.set(floodAreaId, result);
    return result;
  }

  return Object.freeze({
    id: 'environment-agency-floods-england',
    provider: 'environment-agency',
    providerTier: 1,
    pollIntervalMs: POLL_INTERVAL_MS,
    coverage: Object.freeze({ countries: Object.freeze(['England']), regions: Object.freeze([]), kind: 'flood' }),
    async fetchChanges({ cursor = null, runId, signal } = {}) {
      if (typeof runId !== 'string' || runId.trim().length === 0) throw new TypeError('runId is required');
      const start = now().getTime();
      const headers = {};
      if (cursor?.etag) headers['if-none-match'] = cursor.etag;
      if (cursor?.lastModified) headers['if-modified-since'] = cursor.lastModified;
      const floodResult = await fetchJson(FLOODS_URL, { headers, signal });
      const latencyMs = Math.max(0, now().getTime() - start);
      if (floodResult.notModified) {
        return {
          status: 'not-modified', fullSnapshot: false, records: [],
          cursor: { etag: floodResult.response.headers.get('etag'), lastModified: null },
          sourceWatermark: null, httpStatus: 304, latencyMs, counts: { fetched: 0, accepted: 0, rejected: 0 },
        };
      }
      const warnings = floodResult.payload?.items;
      if (!Array.isArray(warnings)) throw new TypeError('Environment Agency flood list must contain items');
      const prepared = await mapWithConcurrency(warnings, async (warning) => {
        const { area, geometry } = await areaGeometryFor(warning);
        const floodAreaId = cleanText(warning.floodAreaID, 80);
        const severityLevel = Number(warning.severityLevel);
        const sourcePublishedAt = isoOrNull(warning.timeRaised);
        const sourceUpdatedAt = latestTimestamp(warning.timeMessageChanged, warning.timeSeverityChanged, warning.timeRaised);
        if (!sourcePublishedAt || !sourceUpdatedAt) throw new TypeError('Environment Agency warning is missing source timestamps');
        const status = statusFor(severityLevel);
        const expiresAt = new Date(now().getTime() + (status === 'resolving' ? 24 * 60 * 60 * 1000 : 45 * 60 * 1000)).toISOString();
        const title = cleanText(warning.description || area.label || floodAreaId, 160);
        const summary = cleanText(warning.message, 600);
        const sourceUrl = httpsUrl(warning['@id'] ?? `${FLOODS_URL}/${encodeURIComponent(floodAreaId)}`);
        return {
          observationInput: {
            provider: 'environment-agency', providerTier: 1, externalId: floodAreaId, sourceUrl,
            sourcePublishedAt, sourceUpdatedAt, rawPayload: { warning, area, geometry }, ingestionRunId: runId,
            validationState: 'valid', validationErrors: [],
          },
          incidentDraft: {
            provider: 'environment-agency', externalId: floodAreaId, category: 'flood', subcategory: warning.severity,
            title: title || `Flood warning ${floodAreaId}`, summary, status, severity: severityFor(severityLevel), geometry,
            centroid: { latitude: Number(area.lat), longitude: Number(area.long) }, locationLabel: cleanText(area.label || warning.description, 160) || floodAreaId,
            locationPrecision: 'exact-area', affectedRadiusMetres: 1_000, sourceOccurredAt: sourcePublishedAt, expiresAt,
          },
        };
      });
      const sourceWatermark = prepared.map((record) => record.observationInput.sourceUpdatedAt).sort().at(-1) ?? null;
      return {
        status: 'success', fullSnapshot: true, records: prepared,
        cursor: { etag: floodResult.response.headers.get('etag'), lastModified: floodResult.response.headers.get('last-modified') },
        sourceWatermark, httpStatus: floodResult.response.status, latencyMs,
        counts: { fetched: warnings.length, accepted: prepared.length, rejected: 0 },
      };
    },
  });
}
