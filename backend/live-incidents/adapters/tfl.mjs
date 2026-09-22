import { createHash } from 'node:crypto';

const API_ORIGIN = 'https://api.tfl.gov.uk';
const ROAD_PATH = '/Road/all/Disruption';
const LINE_PATH = '/Line/Mode/tube,dlr,overground,elizabeth-line,tram/Disruption';
const ROAD_STATUS_URL = 'https://tfl.gov.uk/traffic/status/';
const LINE_STATUS_URL = 'https://tfl.gov.uk/tube-dlr-overground/status/';
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 2;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function isoOrNull(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function requireOfficialApiUrl(value, base = API_ORIGIN) {
  const url = new URL(value, base);
  if (url.protocol !== 'https:' || url.hostname !== 'api.tfl.gov.uk') {
    throw new TypeError('TfL responses must stay on api.tfl.gov.uk');
  }
  return url;
}

function requestUrl(pathname, appKey) {
  const url = requireOfficialApiUrl(pathname);
  url.searchParams.set('app_key', appKey);
  if (pathname === ROAD_PATH) url.searchParams.set('stripContent', 'false');
  return url;
}

function pointGeometry(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new TypeError('TfL disruption point must be valid GeoJSON');
    }
  }
  const coordinates = parsed?.coordinates;
  if (parsed?.type !== 'Point' || !Array.isArray(coordinates) || coordinates.length !== 2) {
    throw new TypeError('TfL disruption point must be a GeoJSON Point');
  }
  const [longitude, latitude] = coordinates.map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)
    || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
    throw new TypeError('TfL disruption point coordinates are invalid');
  }
  return { type: 'Point', coordinates: [longitude, latitude] };
}

function severityForRoad(disruption) {
  if (disruption.hasClosures === true && /full closure/i.test(JSON.stringify(disruption.streets ?? []))) return 5;
  const value = cleanText(disruption.severity, 40).toLowerCase();
  if (value === 'serious') return 5;
  if (value === 'severe') return 4;
  if (value === 'moderate') return 3;
  if (value === 'minimal') return 2;
  return 1;
}

function roadCategory(disruption) {
  const text = `${disruption.category ?? ''} ${disruption.subCategory ?? ''}`.toLowerCase();
  if (/collision|accident|overturned vehicle/.test(text)) return 'road-collision';
  if (disruption.hasClosures === true || /closure|closed/.test(text)) return 'road-closure';
  return 'transport-disruption';
}

function lineSeverity(disruption) {
  const text = `${disruption.closureText ?? ''} ${disruption.summary ?? ''} ${disruption.description ?? ''}`.toLowerCase();
  if (/no service|suspended|part suspended|station closed/.test(text)) return 5;
  if (/severe delay|major delay|closure/.test(text)) return 4;
  if (/minor delay|reduced service|part closure/.test(text)) return 2;
  return 3;
}

function expiryFor(value, now, fallbackMs = 30 * 60 * 1000) {
  const supplied = isoOrNull(value);
  if (supplied && Date.parse(supplied) > now.getTime()) return supplied;
  return new Date(now.getTime() + fallbackMs).toISOString();
}

function centroidForCoordinates(coordinates) {
  return {
    latitude: coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length,
    longitude: coordinates.reduce((sum, coordinate) => sum + coordinate[0], 0) / coordinates.length,
  };
}

function stableLineId(disruption) {
  const routeNames = (disruption.affectedRoutes ?? []).map((route) => cleanText(route?.name, 100)).filter(Boolean).sort();
  const stopIds = (disruption.affectedStops ?? []).map((stop) => cleanText(stop?.naptanId, 80)).filter(Boolean).sort();
  const identity = JSON.stringify({
    category: cleanText(disruption.category, 40),
    created: isoOrNull(disruption.created),
    description: cleanText(disruption.description, 600),
    routeNames,
    stopIds,
  });
  return `line_${createHash('sha256').update(identity).digest('hex').slice(0, 24)}`;
}

function prepareRoad(disruption, runId, now) {
  if (!disruption || typeof disruption !== 'object' || Array.isArray(disruption)) throw new TypeError('TfL road disruption must be an object');
  if (!['Active', 'Active Long Term'].includes(disruption.status)) throw new TypeError('TfL road disruption is not currently active');
  const externalId = cleanText(disruption.id, 120);
  const locationLabel = cleanText(disruption.location, 160);
  const sourcePublishedAt = isoOrNull(disruption.startDateTime);
  const sourceUpdatedAt = isoOrNull(disruption.lastModifiedTime ?? disruption.currentUpdateDateTime);
  if (!externalId || !locationLabel || !sourcePublishedAt || !sourceUpdatedAt) throw new TypeError('TfL road disruption is missing required fields');
  const geometry = pointGeometry(disruption.point);
  const category = roadCategory(disruption);
  const titleBase = cleanText(disruption.subCategory || disruption.category, 100) || 'Road disruption';
  const summary = cleanText([disruption.currentUpdate, disruption.comments].filter(Boolean).join(' '), 600);
  if (!summary) throw new TypeError('TfL road disruption is missing a summary');
  return {
    observationInput: {
      provider: 'transport-for-london', providerTier: 1, externalId, sourceUrl: ROAD_STATUS_URL,
      sourcePublishedAt, sourceUpdatedAt, rawPayload: disruption, ingestionRunId: runId,
      validationState: 'valid', validationErrors: [],
    },
    incidentDraft: {
      provider: 'transport-for-london', externalId, category, subcategory: cleanText(disruption.subCategory, 100) || null,
      title: `${titleBase} on ${locationLabel}`.slice(0, 160), summary, status: 'active', severity: severityForRoad(disruption),
      geometry, centroid: { latitude: geometry.coordinates[1], longitude: geometry.coordinates[0] },
      locationLabel, locationPrecision: 'road-segment', affectedRadiusMetres: disruption.hasClosures ? 700 : 400,
      sourceOccurredAt: sourcePublishedAt, expiresAt: expiryFor(disruption.endDateTime, now),
    },
  };
}

function prepareLine(disruption, runId, now) {
  if (!disruption || typeof disruption !== 'object' || Array.isArray(disruption)) throw new TypeError('TfL line disruption must be an object');
  if (!['RealTime', 'PlannedWork', 'Event', 'Crowding', 'StatusAlert'].includes(disruption.category)) {
    throw new TypeError('TfL line disruption is not an actionable current disruption');
  }
  const coordinates = [];
  const stopNames = [];
  for (const stop of disruption.affectedStops ?? []) {
    const latitude = Number(stop?.lat);
    const longitude = Number(stop?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) continue;
    coordinates.push([longitude, latitude]);
    const name = cleanText(stop?.commonName, 100);
    if (name) stopNames.push(name);
  }
  if (coordinates.length === 0) throw new TypeError('TfL line disruption has no mappable affected stops');
  const sourcePublishedAt = isoOrNull(disruption.created);
  const sourceUpdatedAt = isoOrNull(disruption.lastUpdate ?? disruption.created);
  if (!sourcePublishedAt || !sourceUpdatedAt) throw new TypeError('TfL line disruption is missing source timestamps');
  const externalId = stableLineId(disruption);
  const geometry = coordinates.length === 1
    ? { type: 'Point', coordinates: coordinates[0] }
    : { type: 'LineString', coordinates };
  const routeName = cleanText(disruption.affectedRoutes?.[0]?.name, 100);
  const title = cleanText(disruption.summary || `${routeName || 'TfL'} disruption`, 160);
  const summary = cleanText([disruption.description, disruption.additionalInfo].filter(Boolean).join(' '), 600);
  if (!title || !summary) throw new TypeError('TfL line disruption is missing public text');
  const locationLabel = stopNames.length > 1
    ? `${stopNames[0]} to ${stopNames.at(-1)}`
    : stopNames[0] ?? routeName;
  return {
    observationInput: {
      provider: 'transport-for-london', providerTier: 1, externalId, sourceUrl: LINE_STATUS_URL,
      sourcePublishedAt, sourceUpdatedAt, rawPayload: disruption, ingestionRunId: runId,
      validationState: 'valid', validationErrors: [],
    },
    incidentDraft: {
      provider: 'transport-for-london', externalId, category: 'transport-disruption',
      subcategory: cleanText(disruption.closureText || disruption.categoryDescription, 100) || null,
      title, summary, status: 'active', severity: lineSeverity(disruption), geometry,
      centroid: centroidForCoordinates(coordinates), locationLabel, locationPrecision: 'road-segment',
      affectedRadiusMetres: 600, sourceOccurredAt: sourcePublishedAt, expiresAt: expiryFor(null, now),
    },
  };
}

export function createTflAdapter(options = {}) {
  const appKey = typeof options.appKey === 'string' ? options.appKey.trim() : '';
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  if (!appKey) throw new TypeError('appKey is required for the TfL live adapter');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');

  async function fetchJson(pathname, signal) {
    let currentUrl = requestUrl(pathname, appKey);
    let redirects = 0;
    let lastError;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const timeoutSignal = AbortSignal.any([AbortSignal.timeout(10_000), ...(signal ? [signal] : [])]);
        const response = await fetchImpl(currentUrl.toString(), {
          method: 'GET', redirect: 'manual', signal: timeoutSignal, headers: { accept: 'application/json' },
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          if (redirects >= 2) throw new Error('TfL response exceeded redirect limit');
          const redirected = requireOfficialApiUrl(response.headers.get('location'), currentUrl);
          redirected.searchParams.set('app_key', appKey);
          currentUrl = redirected;
          redirects += 1;
          attempt -= 1;
          continue;
        }
        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < MAX_ATTEMPTS) {
            const retryAfter = Number(response.headers.get('retry-after'));
            await sleep(Number.isFinite(retryAfter) ? Math.min(5_000, Math.max(0, retryAfter * 1_000)) : Math.round(100 + random() * 100));
            continue;
          }
          throw new Error(`TfL request failed with HTTP ${response.status}`);
        }
        const contentLength = Number(response.headers.get('content-length'));
        if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('TfL response exceeded size limit');
        const body = await response.text();
        if (Buffer.byteLength(body, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('TfL response exceeded size limit');
        let payload;
        try {
          payload = JSON.parse(body);
        } catch {
          throw new Error('TfL response was not valid JSON');
        }
        if (!Array.isArray(payload)) throw new TypeError('TfL disruption response must be an array');
        return { payload, status: response.status };
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_ATTEMPTS || !['AbortError', 'TimeoutError'].includes(error?.name)) break;
        await sleep(Math.round(100 + random() * 100));
      }
    }
    throw lastError;
  }

  return Object.freeze({
    id: 'tfl-disruptions-london',
    provider: 'transport-for-london',
    providerTier: 1,
    pollIntervalMs: POLL_INTERVAL_MS,
    coverage: Object.freeze({ countries: Object.freeze(['England']), regions: Object.freeze(['London']), kind: 'transport' }),
    async fetchChanges({ runId, signal } = {}) {
      if (typeof runId !== 'string' || runId.trim().length === 0) throw new TypeError('runId is required');
      const startedAt = now().getTime();
      const [roadResult, lineResult] = await Promise.all([
        fetchJson(ROAD_PATH, signal),
        fetchJson(LINE_PATH, signal),
      ]);
      const currentTime = now();
      const candidates = [
        ...roadResult.payload.map((payload) => ({ kind: 'road', payload })),
        ...lineResult.payload.map((payload) => ({ kind: 'line', payload })),
      ];
      const prepared = [];
      for (const candidate of candidates) {
        try {
          prepared.push(candidate.kind === 'road'
            ? prepareRoad(candidate.payload, runId, currentTime)
            : prepareLine(candidate.payload, runId, currentTime));
        } catch {
          // Provider snapshots can contain incomplete records; retain other valid incidents.
        }
      }
      const sourceWatermark = prepared
        .map((record) => record.observationInput.sourceUpdatedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null;
      return {
        status: 'success', fullSnapshot: true, records: prepared,
        cursor: { sourceWatermark }, sourceWatermark,
        httpStatus: roadResult.status === 200 && lineResult.status === 200 ? 200 : null,
        latencyMs: Math.max(0, now().getTime() - startedAt),
        counts: { fetched: candidates.length, accepted: prepared.length, rejected: candidates.length - prepared.length },
      };
    },
  });
}
