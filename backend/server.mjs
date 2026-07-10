import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const DEFAULT_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 15000);
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 15 * 60 * 1000);
const GEOCODE_CACHE_TTL_MS = Number(process.env.GEOCODE_CACHE_TTL_MS || 24 * 60 * 60 * 1000);
const CRIME_CACHE_TTL_MS = Number(process.env.CRIME_CACHE_TTL_MS || 6 * 60 * 60 * 1000);
const CACHE_MAX_ENTRIES = Number(process.env.CACHE_MAX_ENTRIES || 500);
const POSTCODE_RADIUS_METERS = 400;
const CONTEXT_RADIUS_METERS = 900;
const TREND_MONTH_COUNT = 6;
const PERSISTENT_CACHE_ENABLED = process.env.PERSISTENT_CACHE_ENABLED !== 'false';
const PERSISTENT_CACHE_FILE = process.env.PERSISTENT_CACHE_FILE || path.join(process.cwd(), 'backend', 'cache', 'upstream-cache.json');
const upstreamCache = new Map();
let persistentCacheWrites = 0;
let persistentCacheWriteQueued = false;
let persistentCacheLoaded = false;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function thresholdPoints(count, thresholds) {
  return thresholds.reduce((points, [minimum, award]) => (count >= minimum ? award : points), 0);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function getCacheTtlMs(url) {
  if (url.includes('data.police.uk')) {
    return CRIME_CACHE_TTL_MS;
  }

  if (url.includes('postcodes.io') || url.includes('nominatim.openstreetmap.org')) {
    return GEOCODE_CACHE_TTL_MS;
  }

  return CACHE_TTL_MS;
}

function ensurePersistentCacheDir() {
  if (!PERSISTENT_CACHE_ENABLED) {
    return;
  }

  fs.mkdirSync(path.dirname(PERSISTENT_CACHE_FILE), { recursive: true });
}

function serializeCacheEntries() {
  return [...upstreamCache.entries()].map(([key, entry]) => ({
    key,
    value: entry.value,
    expiresAt: entry.expiresAt,
  }));
}

function schedulePersistentCacheWrite() {
  if (!PERSISTENT_CACHE_ENABLED || persistentCacheWriteQueued) {
    return;
  }

  persistentCacheWriteQueued = true;

  setTimeout(() => {
    persistentCacheWriteQueued = false;

    try {
      ensurePersistentCacheDir();
      fs.writeFileSync(
        PERSISTENT_CACHE_FILE,
        JSON.stringify(
          {
            version: 1,
            savedAt: new Date().toISOString(),
            entries: serializeCacheEntries(),
          },
          null,
          2
        ),
        'utf8'
      );
      persistentCacheWrites += 1;
    } catch (error) {
      console.error('Failed to persist upstream cache:', error);
    }
  }, 150);
}

function loadPersistentCache() {
  if (!PERSISTENT_CACHE_ENABLED) {
    return;
  }

  try {
    if (!fs.existsSync(PERSISTENT_CACHE_FILE)) {
      persistentCacheLoaded = true;
      return;
    }

    const raw = fs.readFileSync(PERSISTENT_CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    const now = Date.now();

    for (const entry of entries) {
      if (!entry?.key || entry.expiresAt <= now) {
        continue;
      }

      upstreamCache.set(entry.key, {
        value: entry.value,
        expiresAt: entry.expiresAt,
      });
    }

    persistentCacheLoaded = true;
  } catch (error) {
    console.error('Failed to load persistent upstream cache:', error);
    persistentCacheLoaded = true;
  }
}

function pruneCacheIfNeeded() {
  if (upstreamCache.size <= CACHE_MAX_ENTRIES) {
    return;
  }

  const entries = [...upstreamCache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const overflow = upstreamCache.size - CACHE_MAX_ENTRIES;

  for (let index = 0; index < overflow; index += 1) {
    upstreamCache.delete(entries[index][0]);
  }

  schedulePersistentCacheWrite();
}

function getCachedResponse(cacheKey) {
  const entry = upstreamCache.get(cacheKey);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    upstreamCache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function setCachedResponse(cacheKey, value, ttlMs) {
  upstreamCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  pruneCacheIfNeeded();
  schedulePersistentCacheWrite();
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 32) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    request.on('error', reject);
  });
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const method = options.method || 'GET';
  const cacheKey = `${method}:${url}`;
  const ttlMs = getCacheTtlMs(url);
  const cached = getCachedResponse(cacheKey);

  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = null;

    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const error = new Error(`Invalid JSON returned by upstream: ${url}`);
        error.statusCode = 502;
        throw error;
      }
    }

    if (!response.ok) {
      const upstreamMessage =
        parsed?.error ||
        parsed?.message ||
        `${response.status} ${response.statusText}`.trim();
      const error = new Error(`Upstream request failed: ${upstreamMessage}`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      throw error;
    }

    if (method === 'GET' && response.ok) {
      setCachedResponse(cacheKey, parsed, ttlMs);
    }

    return parsed;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Upstream request timed out after ${timeoutMs}ms.`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatMonthDisplay(monthValue) {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return 'Recent data';
  }

  const date = new Date(`${monthValue}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatShortMonthDisplay(monthValue) {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return 'Recent';
  }

  const date = new Date(`${monthValue}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function normalizeQuery(query) {
  return String(query || '').trim();
}

function isLikelyUkPostcode(query) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(query);
}

function titleCaseWords(value) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function humanizeCategory(value) {
  return titleCaseWords(String(value || 'other-crime').replace(/-/g, ' '));
}

const SUPPORTED_CRIME_CATEGORIES = [
  'anti-social-behaviour',
  'bicycle-theft',
  'burglary',
  'criminal-damage-arson',
  'drugs',
  'other-crime',
  'other-theft',
  'possession-of-weapons',
  'public-order',
  'robbery',
  'shoplifting',
  'theft-from-the-person',
  'vehicle-crime',
  'violent-crime',
];

function getCategoryCount(categories, key) {
  return categories.find((category) => category.category === key)?.count || 0;
}

function normalizeCategoryFilters(categories) {
  if (!Array.isArray(categories)) {
    return [];
  }

  return [...new Set(
    categories
      .map((category) => String(category || '').trim().toLowerCase())
      .filter(Boolean)
  )];
}

function filterCrimesByCategory(crimes, categories) {
  const normalizedCategories = normalizeCategoryFilters(categories);

  if (!normalizedCategories.length) {
    return crimes;
  }

  return crimes.filter((crime) => normalizedCategories.includes(String(crime?.category || '').toLowerCase()));
}

function sanitizeCrimeRecord(crime) {
  return {
    category: String(crime?.category || 'other-crime'),
    categoryLabel: humanizeCategory(crime?.category || 'other-crime'),
    month: String(crime?.month || ''),
    latitude: Number(crime?.location?.latitude),
    longitude: Number(crime?.location?.longitude),
    locationStreet: String(crime?.location?.street?.name || 'Unknown street'),
    outcome: String(crime?.outcome_status?.category || ''),
  };
}

function buildCrimeFeedSummary({ label, crimes, categories, radiusMeters }) {
  if (!crimes.length) {
    return `No street-level incidents matched the current filters around ${label}.`;
  }

  const topCategory = categories[0];
  const radiusLine = Number.isFinite(radiusMeters) ? ` within roughly ${Math.round(radiusMeters)} metres` : '';

  return `${crimes.length} incidents matched around ${label}${radiusLine}. ${topCategory?.count || 0} were ${humanizeCategory(topCategory?.category || 'other-crime').toLowerCase()}.`;
}

function getDirection(currentValue, previousValue) {
  if (!previousValue && !currentValue) {
    return 'stable';
  }

  if (!previousValue) {
    return currentValue > 0 ? 'rising' : 'stable';
  }

  const deltaRatio = (currentValue - previousValue) / previousValue;
  if (deltaRatio >= 0.12) return 'rising';
  if (deltaRatio <= -0.12) return 'cooling';
  return 'stable';
}

function percentChange(currentValue, previousValue) {
  if (!previousValue) {
    return currentValue > 0 ? 100 : 0;
  }

  return Math.round(((currentValue - previousValue) / previousValue) * 100);
}

function buildTrendSummary(monthly) {
  const latest = monthly[monthly.length - 1] || { totalCrimes: 0, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 };
  const comparison = monthly[Math.max(0, monthly.length - 4)] || monthly[0] || latest;
  const direction = getDirection(latest.totalCrimes, comparison.totalCrimes);
  const overallChangePercent = percentChange(latest.totalCrimes, comparison.totalCrimes);
  const violentDirection = getDirection(latest.violentCrimes, comparison.violentCrimes);
  const antiSocialDirection = getDirection(latest.antiSocialCrimes, comparison.antiSocialCrimes);
  const robberyDirection = getDirection(latest.robberyCrimes, comparison.robberyCrimes);

  let summary = `Crime volume is ${direction} versus ${comparison.monthDisplay}, with a ${Math.abs(overallChangePercent)}% change across the latest police monthly snapshots.`;
  if (violentDirection === 'rising') {
    summary += ' Violent incidents are also trending upward.';
  } else if (violentDirection === 'cooling') {
    summary += ' Violent incidents have been easing recently.';
  } else {
    summary += ' Violent incidents are broadly stable.';
  }

  return {
    direction,
    changePercent: overallChangePercent,
    categoryDirection: {
      violentCrimes: violentDirection,
      antiSocialCrimes: antiSocialDirection,
      robberyCrimes: robberyDirection,
    },
    summary,
  };
}

function deriveDistrictFromAddress(address = {}) {
  return (
    address.city ||
    address.town ||
    address.county ||
    address.state_district ||
    address.municipality ||
    address.village ||
    address.suburb ||
    null
  );
}

async function resolveViaPostcodesIo(query) {
  const encoded = encodeURIComponent(query.replace(/\s+/g, ''));
  const exactUrl = `https://api.postcodes.io/postcodes/${encoded}`;

  try {
    const exactMatch = await fetchJson(exactUrl, {}, 12000);

    if (exactMatch?.result) {
      const { result } = exactMatch;
      return {
        postcode: result.postcode,
        latitude: result.latitude,
        longitude: result.longitude,
        admin_district: result.admin_district || 'Unknown district',
        source: 'postcodes.io',
      };
    }
  } catch (error) {
    if (error.statusCode && error.statusCode !== 404) {
      throw error;
    }
  }

  const searchUrl = `https://api.postcodes.io/postcodes?q=${encodeURIComponent(query)}`;
  const searchMatch = await fetchJson(searchUrl, {}, 12000);
  const first = searchMatch?.result?.[0];

  if (!first) {
    return null;
  }

  return {
    postcode: first.postcode,
    latitude: first.latitude,
    longitude: first.longitude,
    admin_district: first.admin_district || titleCaseWords(query),
    source: 'postcodes.io',
  };
}

async function resolveViaNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
  const results = await fetchJson(
    url,
    {
      headers: {
        'User-Agent': 'RiskRadarBackend/1.0 (Expo local API)',
        Accept: 'application/json',
      },
    },
    15000
  );

  const first = results?.[0];

  if (!first) {
    return null;
  }

  const district = deriveDistrictFromAddress(first.address) || titleCaseWords(query);
  const postcode =
    first.address?.postcode ||
    first.name ||
    district ||
    titleCaseWords(query);

  return {
    postcode,
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    admin_district: district,
    source: 'nominatim',
  };
}

async function fetchNearbyPostcodes(latitude, longitude, limit = 5) {
  const url = `https://api.postcodes.io/postcodes?lon=${encodeURIComponent(longitude)}&lat=${encodeURIComponent(latitude)}&limit=${encodeURIComponent(limit)}`;
  const response = await fetchJson(url, {}, 12000).catch((error) => {
    if (error.statusCode === 404) {
      return { result: [] };
    }
    throw error;
  });

  const candidates = Array.isArray(response?.result) ? response.result : [];

  return candidates
    .filter((entry) => entry?.postcode)
    .map((entry) => ({
      postcode: entry.postcode,
      admin_district: entry.admin_district || 'Nearby area',
    }))
    .slice(0, limit);
}

async function fetchAvailableCrimeMonths() {
  const response = await fetchJson('https://data.police.uk/api/crimes-street-dates', {}, 12000).catch((error) => {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  });

  const dates = Array.isArray(response) ? response : Array.isArray(response?.value) ? response.value : [];

  return dates
    .map((entry) => entry?.date)
    .filter((date) => /^\d{4}-\d{2}$/.test(String(date || '')))
    .slice(0, TREND_MONTH_COUNT);
}

async function fetchFilterMetadata() {
  const monthEntries = await fetchJson('https://data.police.uk/api/crimes-street-dates', {}, 12000).catch((error) => {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  });

  const rawMonths = Array.isArray(monthEntries)
    ? monthEntries
    : Array.isArray(monthEntries?.value)
      ? monthEntries.value
      : [];

  const months = rawMonths
    .map((entry) => ({
      month: String(entry?.date || ''),
      monthDisplay: formatMonthDisplay(String(entry?.date || '')),
    }))
    .filter((entry) => /^\d{4}-\d{2}$/.test(entry.month));

  return {
    months,
    categories: SUPPORTED_CRIME_CATEGORIES.map((category) => ({
      category,
      label: humanizeCategory(category),
    })),
    defaults: {
      postcodeRadiusMeters: POSTCODE_RADIUS_METERS,
      contextRadiusMeters: CONTEXT_RADIUS_METERS,
      trendMonthCount: TREND_MONTH_COUNT,
    },
  };
}

async function locateNeighbourhood(latitude, longitude) {
  const url = `https://data.police.uk/api/locate-neighbourhood?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
  return fetchJson(url, {}, 12000);
}

async function fetchNeighbourhoodBoundary(latitude, longitude) {
  const neighbourhood = await locateNeighbourhood(latitude, longitude).catch((error) => {
    if (error.statusCode === 404) {
      return null;
    }
    throw error;
  });

  if (!neighbourhood?.force || !neighbourhood?.neighbourhood) {
    return {
      neighbourhood: null,
      boundary: [],
    };
  }

  const boundaryUrl = `https://data.police.uk/api/${encodeURIComponent(neighbourhood.force)}/${encodeURIComponent(neighbourhood.neighbourhood)}/boundary`;
  const boundary = await fetchJson(boundaryUrl, {}, 12000).catch((error) => {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  });

  return {
    neighbourhood,
    boundary: Array.isArray(boundary)
      ? boundary
        .map((point) => ({
          latitude: Number(point?.latitude),
          longitude: Number(point?.longitude),
        }))
        .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
      : [],
  };
}

async function fetchStreetCrimesAtPoint(latitude, longitude, month = '') {
  const crimesUrl = month
    ? `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&date=${encodeURIComponent(month)}`
    : `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`;
  const crimes = await fetchJson(crimesUrl, {}, 18000).catch((error) => {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  });

  return Array.isArray(crimes) ? crimes : [];
}

function toPolygonParam(points) {
  return points
    .map((point) => `${point.latitude},${point.longitude}`)
    .join(':');
}

function normalizePolygonPoints(points) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points
    .map((point) => ({
      latitude: Number(point?.latitude ?? point?.lat),
      longitude: Number(point?.longitude ?? point?.lng),
    }))
    .filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
}

async function fetchStreetCrimesInPolygon(points, month = '') {
  const polygonPoints = normalizePolygonPoints(points);

  if (polygonPoints.length < 3) {
    const error = new Error('At least three valid polygon points are required.');
    error.statusCode = 400;
    throw error;
  }

  const polyParam = toPolygonParam(polygonPoints);
  const crimesUrl = month
    ? `https://data.police.uk/api/crimes-street/all-crime?poly=${encodeURIComponent(polyParam)}&date=${encodeURIComponent(month)}`
    : `https://data.police.uk/api/crimes-street/all-crime?poly=${encodeURIComponent(polyParam)}`;
  const crimes = await fetchJson(crimesUrl, {}, 18000).catch((error) => {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  });

  return {
    polygonPoints,
    crimes: Array.isArray(crimes) ? crimes : [],
  };
}

async function resolveLocation(query) {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    const error = new Error('A postcode, ZIP code, city, or place is required.');
    error.statusCode = 400;
    throw error;
  }

  if (isLikelyUkPostcode(normalized)) {
    const postcodeMatch = await resolveViaPostcodesIo(normalized);
    if (postcodeMatch) {
      return postcodeMatch;
    }
  }

  const postcodeSearchMatch = await resolveViaPostcodesIo(normalized).catch((error) => {
    if (error.statusCode && error.statusCode < 500) {
      return null;
    }
    throw error;
  });

  if (postcodeSearchMatch) {
    return postcodeSearchMatch;
  }

  const nominatimMatch = await resolveViaNominatim(normalized);

  if (nominatimMatch) {
    return nominatimMatch;
  }

  const error = new Error('No matching location was found for that search.');
  error.statusCode = 404;
  throw error;
}

function summarizeCrimeCategories(crimes) {
  const totals = new Map();

  for (const crime of crimes) {
    const key = String(crime.category || 'other-crime');
    totals.set(key, (totals.get(key) || 0) + 1);
  }

  return [...totals.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function filterCrimesByRadius(crimes, latitude, longitude, radiusMeters) {
  return crimes.filter((crime) => {
    const incidentLat = Number(crime?.location?.latitude);
    const incidentLon = Number(crime?.location?.longitude);

    if (!Number.isFinite(incidentLat) || !Number.isFinite(incidentLon)) {
      return false;
    }

    return distanceInMeters(latitude, longitude, incidentLat, incidentLon) <= radiusMeters;
  });
}

function scoreCrime(categories, totalCrimes) {
  if (!totalCrimes) {
    return 4;
  }

  const violentCount = getCategoryCount(categories, 'violent-crime') || getCategoryCount(categories, 'violence-and-sexual-offences');
  const robberyCount = getCategoryCount(categories, 'robbery');
  const weaponsCount = getCategoryCount(categories, 'possession-of-weapons');
  const burglaryCount = getCategoryCount(categories, 'burglary');
  const antiSocialCount = getCategoryCount(categories, 'anti-social-behaviour');
  const vehicleCrimeCount = getCategoryCount(categories, 'vehicle-crime');
  const drugsCount = getCategoryCount(categories, 'drugs');
  const theftCount =
    getCategoryCount(categories, 'other-theft') +
    getCategoryCount(categories, 'theft') +
    getCategoryCount(categories, 'theft-from-the-person') +
    getCategoryCount(categories, 'shoplifting') +
    getCategoryCount(categories, 'bicycle-theft');
  const topCategoryShare = (categories[0]?.count || 0) / totalCrimes;
  const violentShare = violentCount / totalCrimes;
  const robberyAndWeaponsCount = robberyCount + weaponsCount;

  // Threshold scoring keeps high scores rare, but still leaves room for meaningful
  // separation between postcodes once crimes are filtered to a tight local radius.
  const robberyPoints = thresholdPoints(robberyCount, [
    [2, 1],
    [5, 2],
    [10, 4],
    [20, 6],
  ]);
  const weaponsPoints = thresholdPoints(weaponsCount, [
    [1, 1],
    [3, 2],
    [6, 4],
  ]);
  const violentPoints = thresholdPoints(violentCount, [
    [10, 1],
    [20, 2],
    [35, 3],
    [60, 4],
    [100, 5],
  ]);
  const burglaryPoints = thresholdPoints(burglaryCount, [
    [3, 1],
    [8, 2],
    [15, 3],
  ]);
  const antiSocialPoints = thresholdPoints(antiSocialCount, [
    [5, 1],
    [15, 2],
    [35, 3],
    [70, 4],
  ]);
  const vehiclePoints = thresholdPoints(vehicleCrimeCount, [
    [5, 1],
    [12, 2],
    [25, 3],
  ]);
  const drugsPoints = thresholdPoints(drugsCount, [
    [3, 1],
    [8, 2],
    [15, 3],
  ]);
  const theftPoints = thresholdPoints(theftCount, [
    [10, 1],
    [25, 2],
    [50, 3],
    [90, 4],
  ]);
  const totalVolumePoints = thresholdPoints(totalCrimes, [
    [25, 1],
    [50, 2],
    [100, 3],
    [180, 4],
    [300, 5],
  ]);
  const concentrationPoints = topCategoryShare >= 0.45 ? 2 : topCategoryShare >= 0.32 ? 1 : 0;
  const violentSharePoints = violentShare >= 0.4 ? 2 : violentShare >= 0.25 ? 1 : 0;
  const harmClusterPoints = thresholdPoints(robberyAndWeaponsCount, [
    [2, 1],
    [6, 2],
    [12, 3],
  ]);

  const score =
    4 +
    robberyPoints +
    weaponsPoints +
    violentPoints +
    burglaryPoints +
    antiSocialPoints +
    vehiclePoints +
    drugsPoints +
    theftPoints +
    totalVolumePoints +
    concentrationPoints +
    violentSharePoints +
    harmClusterPoints;

  return clamp(score, 1, 70);
}

function getSafetyLevel(score) {
  if (score >= 58) return 'SEVERE';
  if (score >= 42) return 'HIGH';
  if (score >= 28) return 'ELEVATED';
  if (score >= 15) return 'MODERATE';
  if (score >= 7) return 'NORMAL URBAN CAUTION';
  return 'LOW RISK';
}

function buildRiskSignals({ district, totalCrimes, categories }) {
  if (!totalCrimes) {
    return [
      `No recent street-level incidents were returned for the selected point in ${district}.`,
      'That can indicate a quieter area or limited public coverage for the exact coordinates used.',
      'Use normal awareness and verify with current local advice before travel.',
    ];
  }

  const signals = [];
  const topCategories = categories.slice(0, 3);

  if (topCategories[0]) {
    signals.push(
      `${topCategories[0].count} reported ${humanizeCategory(topCategories[0].category).toLowerCase()} incidents were found in the latest street-level dataset.`
    );
  }

  if (topCategories[1]) {
    signals.push(
      `${humanizeCategory(topCategories[1].category).toLowerCase()} is also a visible pattern around ${district}.`
    );
  }

  if (totalCrimes >= 25) {
    signals.push('Incident volume is high enough to suggest a busier urban environment with elevated background risk.');
  } else if (totalCrimes >= 10) {
    signals.push('Incident volume is moderate, so route planning and time-of-day awareness still matter.');
  } else {
    signals.push('Incident volume is relatively light, but isolated events still appear in the local feed.');
  }

  return signals;
}

function buildScoreFactors({ district, totalCrimes, categories, crimeScore }) {
  const violentCount = getCategoryCount(categories, 'violent-crime') || getCategoryCount(categories, 'violence-and-sexual-offences');
  const antiSocialCount = getCategoryCount(categories, 'anti-social-behaviour');
  const robberyCount = getCategoryCount(categories, 'robbery');
  const theftCount = getCategoryCount(categories, 'other-theft') + getCategoryCount(categories, 'theft') + getCategoryCount(categories, 'theft-from-the-person');
  const topCategory = categories[0];
  const factors = [];

  if (violentCount > 0) {
    factors.push({
      label: 'Violent crime mix',
      impact: violentCount / Math.max(totalCrimes, 1) > 0.18 ? 'up' : 'neutral',
      detail: `${violentCount} violent incidents are part of the current street-level mix around ${district}.`,
    });
  }

  if (robberyCount > 0) {
    factors.push({
      label: 'Robbery and weapons pressure',
      impact: robberyCount >= 15 || getCategoryCount(categories, 'possession-of-weapons') >= 5 ? 'up' : 'neutral',
      detail: `${robberyCount} robbery incidents were recorded. In the current model, robbery only starts adding serious points once it crosses harder thresholds.`,
    });
  }

  if (theftCount > 0) {
    factors.push({
      label: 'Theft-driven activity',
      impact: 'neutral',
      detail: `${theftCount} theft-related incidents suggest a busy footfall environment rather than danger from one category alone.`,
    });
  }

  if (antiSocialCount > 0) {
    factors.push({
      label: 'Area disorder signal',
      impact: antiSocialCount >= 90 ? 'up' : 'neutral',
      detail: `${antiSocialCount} anti-social behaviour reports indicate visible street disorder, but they now contribute less unless the count is very high.`,
    });
  }

  if (topCategory) {
    factors.push({
      label: 'Concentrated pattern',
      impact: topCategory.count / Math.max(totalCrimes, 1) > 0.33 ? 'up' : 'neutral',
      detail: `${humanizeCategory(topCategory.category)} is the largest category right now, accounting for ${topCategory.count} of the recorded incidents.`,
    });
  }

  if (totalCrimes <= 12) {
    factors.push({
      label: 'Lower reporting volume',
      impact: 'down',
      detail: `Only ${totalCrimes} incidents were found inside the postcode-level search radius for the latest month, which keeps the score from climbing too aggressively.`,
    });
  } else if (crimeScore < 45) {
    factors.push({
      label: 'Moderated overall risk',
      impact: 'down',
      detail: 'The final score is moderated because the postcode-level incident mix is not dominated by the highest-severity categories.',
    });
  }

  return factors.slice(0, 4);
}

function buildAreaContext({ district, totalCrimes, categories }) {
  const shopliftingCount = getCategoryCount(categories, 'shoplifting');
  const theftCount = getCategoryCount(categories, 'other-theft') + getCategoryCount(categories, 'theft-from-the-person');
  const antiSocialCount = getCategoryCount(categories, 'anti-social-behaviour');
  const vehicleCrimeCount = getCategoryCount(categories, 'vehicle-crime');

  if (shopliftingCount + theftCount >= Math.max(20, totalCrimes * 0.28)) {
    return `${district} behaves like a busy commercial or commuter zone, where retail activity and passing footfall tend to lift opportunistic crime volumes.`;
  }

  if (antiSocialCount + vehicleCrimeCount >= Math.max(12, totalCrimes * 0.22)) {
    return `${district} reads more like a mixed residential area with local disorder and vehicle-related pressure rather than pure city-centre crowding.`;
  }

  if (totalCrimes >= 120) {
    return `${district} looks like a high-activity urban patch with steady movement through the area, but the risk is spread across several categories rather than one extreme pattern.`;
  }

  return `${district} appears closer to a quieter residential or mixed-use area, with risk shaped by a smaller number of repeating local issues.`;
}

function clusterCrimesIntoHotspots({ latitude, longitude, crimes, minimumClusterSize = 3, maxClusters = 3 }) {
  const clustersByCell = new Map();

  for (const crime of crimes) {
    const incidentLat = Number(crime?.location?.latitude);
    const incidentLon = Number(crime?.location?.longitude);

    if (!Number.isFinite(incidentLat) || !Number.isFinite(incidentLon)) {
      continue;
    }

    // Small grid grouping keeps hotspot summaries stable without extra map infrastructure.
    const latCell = Math.round(incidentLat * 250);
    const lonCell = Math.round(incidentLon * 250);
    const cellKey = `${latCell}:${lonCell}`;
    const existing = clustersByCell.get(cellKey);

    if (existing) {
      existing.count += 1;
      existing.latitudeTotal += incidentLat;
      existing.longitudeTotal += incidentLon;
      existing.categories.push(String(crime.category || 'other-crime'));
    } else {
      clustersByCell.set(cellKey, {
        count: 1,
        latitudeTotal: incidentLat,
        longitudeTotal: incidentLon,
        categories: [String(crime.category || 'other-crime')],
      });
    }
  }

  return [...clustersByCell.values()]
    .filter((cluster) => cluster.count >= minimumClusterSize)
    .map((cluster) => {
      const centerLat = cluster.latitudeTotal / cluster.count;
      const centerLon = cluster.longitudeTotal / cluster.count;
      const topCategories = summarizeCrimeCategories(
        cluster.categories.map((category) => ({ category }))
      ).slice(0, 2);
      const topCategory = topCategories[0]?.category || 'other-crime';

      return {
        count: cluster.count,
        latitude: Number(centerLat.toFixed(6)),
        longitude: Number(centerLon.toFixed(6)),
        distanceMeters: Math.round(distanceInMeters(latitude, longitude, centerLat, centerLon)),
        topCategory,
        topCategoryLabel: humanizeCategory(topCategory),
        categories: topCategories,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, maxClusters);
}

function summarizeHotspots({ district, latitude, longitude, crimes }) {
  if (!crimes.length) {
    return {
      clusters: [],
      summary: `No repeat hotspot clusters were strong enough to stand out around ${district} in the latest postcode context.`,
    };
  }

  const clusters = clusterCrimesIntoHotspots({
    latitude,
    longitude,
    crimes,
  });

  if (!clusters.length) {
    return {
      clusters: [],
      summary: `Incidents around ${district} are fairly dispersed rather than stacking into one dominant hotspot cluster right now.`,
    };
  }

  const leadCluster = clusters[0];
  const secondaryCluster = clusters[1];
  let summary = `The tightest hotspot near ${district} contains ${leadCluster.count} recent incidents centred about ${leadCluster.distanceMeters}m from the searched postcode, led by ${leadCluster.topCategoryLabel.toLowerCase()}.`;

  if (secondaryCluster) {
    summary += ` A second cluster of ${secondaryCluster.count} incidents also appears roughly ${secondaryCluster.distanceMeters}m away.`;
  }

  return { clusters, summary };
}

function averageCoordinates(points) {
  if (!points.length) {
    return { latitude: 0, longitude: 0 };
  }

  const totals = points.reduce((accumulator, point) => ({
    latitude: accumulator.latitude + point.latitude,
    longitude: accumulator.longitude + point.longitude,
  }), { latitude: 0, longitude: 0 });

  return {
    latitude: totals.latitude / points.length,
    longitude: totals.longitude / points.length,
  };
}

function buildPremiumInsights({ trendData, areaContext, hotspotSummary }) {
  return [
    {
      id: 'trend',
      title: 'Crime Trend Graph',
      description: trendData.summary,
      badge: trendData.direction === 'rising' ? 'Rising' : trendData.direction === 'cooling' ? 'Cooling' : 'Stable',
    },
    {
      id: 'category-trend',
      title: 'Category Trend Graph',
      description: `Track whether violent crime, anti-social behaviour, and robbery are trending up or down over the last ${trendData.monthly.length} months.`,
      badge: 'Live',
    },
    {
      id: 'area-context',
      title: 'Area Busyness Proxy',
      description: areaContext,
      badge: 'Context',
    },
    {
      id: 'hotspot-map',
      title: 'Hotspot Map',
      description: hotspotSummary,
      badge: 'Map',
    },
  ];
}

function buildAiAnalysis({ district, safetyLevel, totalCrimes, topCategories, scoreFactors, areaContext, trendData }) {
  const primaryCategory = humanizeCategory(topCategories[0]?.category || 'reported incidents').toLowerCase();
  const scoreStory = scoreFactors.map((factor) => factor.detail);

  return {
    summary: `${district} currently scores ${safetyLevel.toLowerCase()} because of the latest incident volume, the severity mix of recorded offences, and the way those incidents are concentrated around the area.`,
    whatToAvoid: [
      `Poorly lit streets around ${district} late at night.`,
      `Areas where ${primaryCategory} has been repeatedly logged.`,
      'Leaving valuables visible in transit or parked vehicles.',
    ],
    safetyTips: [
      'Stay on well-used routes and keep phone battery available for navigation.',
      'Check the latest local police and council notices before visiting unfamiliar streets.',
      totalCrimes >= 20 ? 'Avoid isolated shortcuts after dark when possible.' : 'Use normal urban awareness and trust active, busy routes.',
    ],
    localVibe: totalCrimes >= 20
      ? 'Busy urban environment with enough incident density to justify extra caution.'
      : 'Mixed local environment with manageable but still real day-to-day safety considerations.',
    scoreStory,
    areaContext: `${areaContext} ${trendData.summary}`,
  };
}

function buildComparisonSummary(results) {
  if (!results.length) {
    return 'No postcode comparisons were generated.';
  }

  const sorted = [...results].sort((a, b) => b.crimeData.crimeScore - a.crimeData.crimeScore);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  if (sorted.length === 1) {
    return `${highest.postcodeData.postcode} currently scores ${highest.crimeData.crimeScore}/100 in the latest postcode-level comparison.`;
  }

  return `${highest.postcodeData.postcode} is highest at ${highest.crimeData.crimeScore}/100, while ${lowest.postcodeData.postcode} is lowest at ${lowest.crimeData.crimeScore}/100 in this postcode-level comparison.`;
}

function buildAreaComparisonSummary(results) {
  if (!results.length) {
    return 'No area comparisons were generated.';
  }

  const sorted = [...results].sort((a, b) => b.crimeData.crimeScore - a.crimeData.crimeScore);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];

  if (sorted.length === 1) {
    return `${highest.label} currently scores ${highest.crimeData.crimeScore}/100 in the latest area comparison.`;
  }

  return `${highest.label} is highest at ${highest.crimeData.crimeScore}/100, while ${lowest.label} is lowest at ${lowest.crimeData.crimeScore}/100 in this area comparison.`;
}

async function fetchCrimeData(latitude, longitude) {
  const safeCrimes = await fetchStreetCrimesAtPoint(latitude, longitude);
  const postcodeCrimes = filterCrimesByRadius(safeCrimes, latitude, longitude, POSTCODE_RADIUS_METERS);
  const contextCrimes = filterCrimesByRadius(safeCrimes, latitude, longitude, CONTEXT_RADIUS_METERS);

  const postcodeCategories = summarizeCrimeCategories(postcodeCrimes);
  const contextCategories = summarizeCrimeCategories(contextCrimes);
  const postcodeCrimeScore = scoreCrime(postcodeCategories, postcodeCrimes.length);
  const contextCrimeScore = scoreCrime(contextCategories, contextCrimes.length);
  const blendedCrimeScore = Math.round(postcodeCrimeScore * 0.65 + contextCrimeScore * 0.35);
  const totalCrimes = postcodeCrimes.length;
  const month = postcodeCrimes?.[0]?.month || contextCrimes?.[0]?.month || safeCrimes?.[0]?.month || null;

  return {
    totalCrimes,
    crimeScore: blendedCrimeScore,
    safetyLevel: getSafetyLevel(blendedCrimeScore),
    month: month || '',
    monthDisplay: formatMonthDisplay(month),
    categories: postcodeCategories,
    contextCrimeCount: contextCrimes.length,
    postcodeRadiusMeters: POSTCODE_RADIUS_METERS,
    contextRadiusMeters: CONTEXT_RADIUS_METERS,
    capExplanation:
      `Live score blends incidents within roughly ${POSTCODE_RADIUS_METERS} metres of the postcode point with a wider ${CONTEXT_RADIUS_METERS} metre context view, so the result stays postcode-led without becoming too brittle around one exact point.`,
  };
}

async function fetchPostcodeCrimeFeed(query, options = {}) {
  const location = await resolveLocation(query);
  const radiusMeters = clamp(Number(options.radiusMeters) || POSTCODE_RADIUS_METERS, 100, 1500);
  const categoryFilters = normalizeCategoryFilters(options.categories);
  const crimes = await fetchStreetCrimesAtPoint(location.latitude, location.longitude, String(options.month || ''));
  const radiusFilteredCrimes = filterCrimesByRadius(crimes, location.latitude, location.longitude, radiusMeters);
  const filteredCrimes = filterCrimesByCategory(radiusFilteredCrimes, categoryFilters);
  const categories = summarizeCrimeCategories(filteredCrimes);

  return {
    postcode: location.postcode,
    district: location.admin_district,
    latitude: location.latitude,
    longitude: location.longitude,
    radiusMeters,
    month: String(options.month || filteredCrimes?.[0]?.month || crimes?.[0]?.month || ''),
    appliedCategories: categoryFilters,
    totalCrimes: filteredCrimes.length,
    summary: buildCrimeFeedSummary({
      label: location.postcode,
      crimes: filteredCrimes,
      categories,
      radiusMeters,
    }),
    categories,
    crimes: filteredCrimes.map(sanitizeCrimeRecord),
  };
}

async function fetchPointCrimeFeed(latitude, longitude, options = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error('Valid latitude and longitude are required.');
    error.statusCode = 400;
    throw error;
  }

  const radiusMeters = clamp(Number(options.radiusMeters) || POSTCODE_RADIUS_METERS, 100, 3000);
  const categoryFilters = normalizeCategoryFilters(options.categories);
  const crimes = await fetchStreetCrimesAtPoint(latitude, longitude, String(options.month || ''));
  const radiusFilteredCrimes = filterCrimesByRadius(crimes, latitude, longitude, radiusMeters);
  const filteredCrimes = filterCrimesByCategory(radiusFilteredCrimes, categoryFilters);
  const categories = summarizeCrimeCategories(filteredCrimes);
  const latestMonth = String(options.month || filteredCrimes?.[0]?.month || crimes?.[0]?.month || '');

  return {
    point: {
      latitude,
      longitude,
      radiusMeters,
    },
    month: latestMonth,
    appliedCategories: categoryFilters,
    totalCrimes: filteredCrimes.length,
    summary: buildCrimeFeedSummary({
      label: 'the selected point',
      crimes: filteredCrimes,
      categories,
      radiusMeters,
    }),
    categories,
    crimes: filteredCrimes.map(sanitizeCrimeRecord),
  };
}

async function fetchAreaCrimeFeed(points, options = {}) {
  const { polygonPoints, crimes } = await fetchStreetCrimesInPolygon(points, String(options.month || ''));
  const categoryFilters = normalizeCategoryFilters(options.categories);
  const filteredCrimes = filterCrimesByCategory(crimes, categoryFilters);
  const categories = summarizeCrimeCategories(filteredCrimes);
  const latestMonth = String(options.month || filteredCrimes?.[0]?.month || crimes?.[0]?.month || '');

  return {
    polygon: polygonPoints,
    month: latestMonth,
    appliedCategories: categoryFilters,
    totalCrimes: filteredCrimes.length,
    summary: buildCrimeFeedSummary({
      label: 'the selected area',
      crimes: filteredCrimes,
      categories,
    }),
    categories,
    crimes: filteredCrimes.map(sanitizeCrimeRecord),
  };
}

async function analyzeArea(area = {}) {
  const label = String(area.label || '').trim() || 'Selected area';
  const polygonPoints = normalizePolygonPoints(area.points);

  if (polygonPoints.length < 3) {
    const error = new Error(`Area "${label}" must include at least three valid polygon points.`);
    error.statusCode = 400;
    throw error;
  }

  const latestAreaFeed = await fetchAreaCrimeFeed(polygonPoints, {
    month: area.month,
    categories: area.categories,
  });
  const contextCategories = latestAreaFeed.categories;
  const crimeScore = scoreCrime(contextCategories, latestAreaFeed.totalCrimes);
  const hotspotPayload = await fetchHotspotMap({
    points: polygonPoints,
    month: area.month,
    categories: area.categories,
    minimumClusterSize: area.minimumClusterSize,
    maxClusters: area.maxClusters,
  });
  const trendData = await fetchMonthlyCrimeSeries({
    points: polygonPoints,
    monthCount: area.monthCount,
    categories: area.categories,
  });
  const areaCenter = averageCoordinates(polygonPoints);
  const riskSignals = buildRiskSignals({
    district: label,
    totalCrimes: latestAreaFeed.totalCrimes,
    categories: contextCategories,
  });
  const scoreFactors = buildScoreFactors({
    district: label,
    totalCrimes: latestAreaFeed.totalCrimes,
    categories: contextCategories,
    crimeScore,
  });
  const areaContext = buildAreaContext({
    district: label,
    totalCrimes: latestAreaFeed.totalCrimes,
    categories: contextCategories,
  });

  return {
    label,
    areaData: {
      polygon: polygonPoints,
      center: areaCenter,
      month: latestAreaFeed.month,
      appliedCategories: latestAreaFeed.appliedCategories,
    },
    crimeData: {
      totalCrimes: latestAreaFeed.totalCrimes,
      crimeScore,
      safetyLevel: getSafetyLevel(crimeScore),
      month: latestAreaFeed.month || '',
      monthDisplay: formatMonthDisplay(latestAreaFeed.month),
      categories: contextCategories,
      riskSignals,
      scoreFactors,
      capExplanation: `Area score is calculated from incidents inside the selected polygon, using the same category thresholds as postcode analysis but without a postcode-radius blend.`,
    },
    aiAnalysis: buildAiAnalysis({
      district: label,
      safetyLevel: getSafetyLevel(crimeScore),
      totalCrimes: latestAreaFeed.totalCrimes,
      topCategories: contextCategories,
      scoreFactors,
      areaContext,
      trendData,
    }),
    trendData,
    hotspotData: {
      clusters: hotspotPayload.clusters,
      summary: hotspotPayload.summary,
    },
    summary: latestAreaFeed.summary,
  };
}

function buildMonthlyPointFromCrimes(monthKey, crimes) {
  return {
    month: monthKey,
    monthDisplay: formatShortMonthDisplay(monthKey),
    totalCrimes: crimes.length,
    violentCrimes: crimes.filter((crime) => ['violent-crime', 'violence-and-sexual-offences'].includes(crime.category)).length,
    antiSocialCrimes: crimes.filter((crime) => crime.category === 'anti-social-behaviour').length,
    robberyCrimes: crimes.filter((crime) => crime.category === 'robbery').length,
  };
}

async function fetchMonthlyCrimeSeries(payload = {}) {
  const monthCount = clamp(Number(payload.monthCount) || TREND_MONTH_COUNT, 3, 12);
  const monthKeys = (await fetchAvailableCrimeMonths()).slice(0, monthCount).reverse();
  const categoryFilters = normalizeCategoryFilters(payload.categories);
  const monthly = [];

  try {
    if (payload.postcode || payload.query) {
      const location = await resolveLocation(payload.postcode ?? payload.query);
      const radiusMeters = clamp(Number(payload.radiusMeters) || POSTCODE_RADIUS_METERS, 100, 3000);

      for (const monthKey of monthKeys) {
        // eslint-disable-next-line no-await-in-loop
        const crimes = await fetchStreetCrimesAtPoint(location.latitude, location.longitude, monthKey);
        const radiusFilteredCrimes = filterCrimesByRadius(crimes, location.latitude, location.longitude, radiusMeters);
        const filteredCrimes = filterCrimesByCategory(radiusFilteredCrimes, categoryFilters);
        monthly.push(buildMonthlyPointFromCrimes(monthKey, filteredCrimes));

        if (monthKey !== monthKeys[monthKeys.length - 1]) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(150);
        }
      }

      const trend = buildTrendSummary(monthly);

      return {
        mode: 'postcode',
        target: {
          postcode: location.postcode,
          district: location.admin_district,
          latitude: location.latitude,
          longitude: location.longitude,
          radiusMeters,
        },
        monthCount,
        appliedCategories: categoryFilters,
        monthly,
        ...trend,
      };
    }

    const polygonPoints = normalizePolygonPoints(payload.points);
    if (polygonPoints.length < 3) {
      const error = new Error('A postcode/query or at least three polygon points are required.');
      error.statusCode = 400;
      throw error;
    }

    for (const monthKey of monthKeys) {
      // eslint-disable-next-line no-await-in-loop
      const areaResult = await fetchStreetCrimesInPolygon(polygonPoints, monthKey);
      const filteredCrimes = filterCrimesByCategory(areaResult.crimes, categoryFilters);
      monthly.push(buildMonthlyPointFromCrimes(monthKey, filteredCrimes));

      if (monthKey !== monthKeys[monthKeys.length - 1]) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(150);
      }
    }

    const trend = buildTrendSummary(monthly);

    return {
      mode: 'area',
      target: {
        polygon: polygonPoints,
        center: averageCoordinates(polygonPoints),
      },
      monthCount,
      appliedCategories: categoryFilters,
      monthly,
      ...trend,
    };
  } catch (error) {
    if (error.statusCode === 429) {
      const fallbackMonthly = monthKeys.map((monthKey) => {
        const existing = monthly.find((point) => point.month === monthKey);
        return existing || buildMonthlyPointFromCrimes(monthKey, []);
      });

      return {
        mode: payload.postcode || payload.query ? 'postcode' : 'area',
        target: payload.postcode || payload.query
          ? { query: payload.postcode ?? payload.query }
          : { polygon: normalizePolygonPoints(payload.points) },
        monthCount,
        appliedCategories: categoryFilters,
        monthly: fallbackMonthly,
        direction: 'stable',
        changePercent: 0,
        categoryDirection: {
          violentCrimes: 'stable',
          antiSocialCrimes: 'stable',
          robberyCrimes: 'stable',
        },
        summary: monthly.length
          ? 'Monthly series data is partially loaded because the public police API throttled part of the history lookup.'
          : 'Monthly series data is temporarily unavailable because the public police API throttled the history lookup.',
      };
    }

    throw error;
  }
}

async function fetchHotspotMap(payload = {}) {
  const pointQuery = payload.postcode ?? payload.query ?? '';
  const categoryFilters = normalizeCategoryFilters(payload.categories);
  const month = String(payload.month || '');
  const minimumClusterSize = clamp(Number(payload.minimumClusterSize) || 3, 2, 20);
  const maxClusters = clamp(Number(payload.maxClusters) || 8, 1, 25);

  if (pointQuery) {
    const location = await resolveLocation(pointQuery);
    const radiusMeters = clamp(Number(payload.radiusMeters) || CONTEXT_RADIUS_METERS, 200, 3000);
    const crimes = await fetchStreetCrimesAtPoint(location.latitude, location.longitude, month);
    const radiusFilteredCrimes = filterCrimesByRadius(crimes, location.latitude, location.longitude, radiusMeters);
    const filteredCrimes = filterCrimesByCategory(radiusFilteredCrimes, categoryFilters);
    const clusters = clusterCrimesIntoHotspots({
      latitude: location.latitude,
      longitude: location.longitude,
      crimes: filteredCrimes,
      minimumClusterSize,
      maxClusters,
    });

    return {
      mode: 'postcode',
      target: {
        postcode: location.postcode,
        district: location.admin_district,
        latitude: location.latitude,
        longitude: location.longitude,
        radiusMeters,
      },
      month,
      appliedCategories: categoryFilters,
      totalCrimes: filteredCrimes.length,
      clusterCount: clusters.length,
      summary: clusters.length
        ? `${clusters.length} hotspot clusters were identified around ${location.postcode}.`
        : `No hotspot clusters met the current threshold around ${location.postcode}.`,
      clusters,
    };
  }

  const { polygonPoints, crimes } = await fetchStreetCrimesInPolygon(payload.points, month);
  const filteredCrimes = filterCrimesByCategory(crimes, categoryFilters);
  const center = averageCoordinates(polygonPoints);
  const clusters = clusterCrimesIntoHotspots({
    latitude: center.latitude,
    longitude: center.longitude,
    crimes: filteredCrimes,
    minimumClusterSize,
    maxClusters,
  });

  return {
    mode: 'area',
    target: {
      polygon: polygonPoints,
      center,
    },
    month,
    appliedCategories: categoryFilters,
    totalCrimes: filteredCrimes.length,
    clusterCount: clusters.length,
    summary: clusters.length
      ? `${clusters.length} hotspot clusters were identified inside the selected area.`
      : 'No hotspot clusters met the current threshold inside the selected area.',
    clusters,
  };
}

async function fetchCrimeHistory(latitude, longitude, monthCount = TREND_MONTH_COUNT) {
  const monthKeys = (await fetchAvailableCrimeMonths()).slice(0, monthCount).reverse();
  const monthly = [];

  try {
    for (const monthKey of monthKeys) {
      const crimesUrl = `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&date=${monthKey}`;
      // eslint-disable-next-line no-await-in-loop
      const crimes = await fetchJson(crimesUrl, {}, 18000).catch((error) => {
        if (error.statusCode === 404) {
          return [];
        }
        throw error;
      });

      const safeCrimes = Array.isArray(crimes) ? crimes : [];
      const postcodeCrimes = filterCrimesByRadius(safeCrimes, latitude, longitude, POSTCODE_RADIUS_METERS);

      monthly.push({
        month: monthKey,
        monthDisplay: formatShortMonthDisplay(monthKey),
        totalCrimes: postcodeCrimes.length,
        violentCrimes: postcodeCrimes.filter((crime) => ['violent-crime', 'violence-and-sexual-offences'].includes(crime.category)).length,
        antiSocialCrimes: postcodeCrimes.filter((crime) => crime.category === 'anti-social-behaviour').length,
        robberyCrimes: postcodeCrimes.filter((crime) => crime.category === 'robbery').length,
      });

      if (monthKey !== monthKeys[monthKeys.length - 1]) {
        // Light pacing helps with public API throttling when several users search at once.
        // eslint-disable-next-line no-await-in-loop
        await sleep(150);
      }
    }
  } catch (error) {
    if (error.statusCode === 429) {
      const fallbackMonthly = monthKeys.map((monthKey) => {
        const existing = monthly.find((point) => point.month === monthKey);
        return existing || {
          month: monthKey,
          monthDisplay: formatShortMonthDisplay(monthKey),
          totalCrimes: 0,
          violentCrimes: 0,
          antiSocialCrimes: 0,
          robberyCrimes: 0,
        };
      });

      return {
        monthly: fallbackMonthly,
        direction: 'stable',
        changePercent: 0,
        categoryDirection: {
          violentCrimes: 'stable',
          antiSocialCrimes: 'stable',
          robberyCrimes: 'stable',
        },
        summary: monthly.length
          ? 'Historical trend data is partially loaded because the public police API throttled part of the month-by-month lookup.'
          : 'Historical trend data is temporarily unavailable because the public police API throttled the month-by-month lookup.',
      };
    }

    throw error;
  }
  return {
    monthly,
    ...buildTrendSummary(monthly),
  };
}

async function analyzeLocation(query) {
  const location = await resolveLocation(query);
  const crimeData = await fetchCrimeData(location.latitude, location.longitude);
  const trendData = await fetchCrimeHistory(location.latitude, location.longitude);
  const latestContextCrimes = await fetchStreetCrimesAtPoint(location.latitude, location.longitude);
  const hotspotData = summarizeHotspots({
    district: location.admin_district,
    latitude: location.latitude,
    longitude: location.longitude,
    crimes: filterCrimesByRadius(
      Array.isArray(latestContextCrimes) ? latestContextCrimes : [],
      location.latitude,
      location.longitude,
      CONTEXT_RADIUS_METERS
    ),
  });
  const scoreFactors = buildScoreFactors({
    district: location.admin_district,
    totalCrimes: crimeData.totalCrimes,
    categories: crimeData.categories,
    crimeScore: crimeData.crimeScore,
  });
  const areaContext = buildAreaContext({
    district: location.admin_district,
    totalCrimes: crimeData.totalCrimes,
    categories: crimeData.categories,
  });
  const riskSignals = buildRiskSignals({
    district: location.admin_district,
    totalCrimes: crimeData.totalCrimes,
    categories: crimeData.categories,
  });

  return {
    postcode: location.postcode,
    crimeData: {
      ...crimeData,
      riskSignals,
      scoreFactors,
    },
    postcodeData: {
      admin_district: location.admin_district,
      longitude: location.longitude,
      latitude: location.latitude,
      postcode: location.postcode,
    },
    aiAnalysis: buildAiAnalysis({
      district: location.admin_district,
      safetyLevel: crimeData.safetyLevel,
      totalCrimes: crimeData.totalCrimes,
      topCategories: crimeData.categories,
      scoreFactors,
      areaContext,
      trendData,
    }),
    trendData,
    premiumInsights: buildPremiumInsights({
      trendData,
      areaContext: `${areaContext} ${hotspotData.summary}`,
      hotspotSummary: hotspotData.summary,
    }),
    hotspotData,
    newsLink: `https://news.google.com/search?q=${encodeURIComponent(`${location.admin_district} police OR crime`)}`,
  };
}

async function compareLocations(queries) {
  const normalizedQueries = [...new Set(
    queries
      .map((query) => normalizeQuery(query))
      .filter(Boolean)
  )].slice(0, 5);

  if (!normalizedQueries.length) {
    const error = new Error('At least one postcode or place is required for comparison.');
    error.statusCode = 400;
    throw error;
  }

  const results = [];

  // Keep comparison fetches sequential to avoid spiking public API rate limits.
  for (const query of normalizedQueries) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await analyzeLocation(query));
  }

  const sorted = [...results].sort((a, b) => b.crimeData.crimeScore - a.crimeData.crimeScore);

  return {
    comparedAt: new Date().toISOString(),
    summary: buildComparisonSummary(sorted),
    results: sorted,
  };
}

async function compareAreas(areas) {
  const normalizedAreas = Array.isArray(areas)
    ? areas.filter((area) => Array.isArray(area?.points) && area.points.length >= 3).slice(0, 5)
    : [];

  if (!normalizedAreas.length) {
    const error = new Error('At least one valid area with polygon points is required for comparison.');
    error.statusCode = 400;
    throw error;
  }

  const results = [];

  for (const area of normalizedAreas) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await analyzeArea(area));
  }

  const sorted = [...results].sort((a, b) => b.crimeData.crimeScore - a.crimeData.crimeScore);

  return {
    comparedAt: new Date().toISOString(),
    summary: buildAreaComparisonSummary(sorted),
    results: sorted,
  };
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'riskradar-api',
      timestamp: new Date().toISOString(),
      cache: {
        entries: upstreamCache.size,
        maxEntries: CACHE_MAX_ENTRIES,
        persistentEnabled: PERSISTENT_CACHE_ENABLED,
        persistentLoaded: persistentCacheLoaded,
        persistentFile: PERSISTENT_CACHE_FILE,
        persistentWrites: persistentCacheWrites,
      },
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/filter-metadata') {
    try {
      const result = await fetchFilterMetadata();
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/analyze-postcode') {
    try {
      const body = await readJsonBody(request);
      const query = body.postcode ?? body.query ?? '';
      const result = await analyzeLocation(query);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/compare-postcodes') {
    try {
      const body = await readJsonBody(request);
      const queries = Array.isArray(body.postcodes) ? body.postcodes : [];
      const result = await compareLocations(queries);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/postcode-crimes') {
    try {
      const body = await readJsonBody(request);
      const query = body.postcode ?? body.query ?? '';
      const result = await fetchPostcodeCrimeFeed(query, {
        month: body.month,
        radiusMeters: body.radiusMeters,
        categories: body.categories,
      });
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/point-crimes') {
    try {
      const body = await readJsonBody(request);
      const latitude = Number(body.latitude ?? body.lat);
      const longitude = Number(body.longitude ?? body.lng);
      const result = await fetchPointCrimeFeed(latitude, longitude, {
        month: body.month,
        radiusMeters: body.radiusMeters,
        categories: body.categories,
      });
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/area-crimes') {
    try {
      const body = await readJsonBody(request);
      const result = await fetchAreaCrimeFeed(body.points, {
        month: body.month,
        categories: body.categories,
      });
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/point-boundary') {
    try {
      const latitude = Number(url.searchParams.get('lat'));
      const longitude = Number(url.searchParams.get('lng'));

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const error = new Error('Valid lat and lng query parameters are required.');
        error.statusCode = 400;
        throw error;
      }

      const result = await fetchNeighbourhoodBoundary(latitude, longitude);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/map-hotspots') {
    try {
      const body = await readJsonBody(request);
      const result = await fetchHotspotMap(body);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/monthly-crime-series') {
    try {
      const body = await readJsonBody(request);
      const result = await fetchMonthlyCrimeSeries(body);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/compare-areas') {
    try {
      const body = await readJsonBody(request);
      const result = await compareAreas(body.areas);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/location-suggestions') {
    try {
      const latitude = Number(url.searchParams.get('lat'));
      const longitude = Number(url.searchParams.get('lng'));

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const error = new Error('Valid lat and lng query parameters are required.');
        error.statusCode = 400;
        throw error;
      }

      const nearby = await fetchNearbyPostcodes(latitude, longitude);
      sendJson(response, 200, {
        nearby,
      });
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

loadPersistentCache();

server.listen(PORT, HOST, () => {
  console.log(`RiskRadar API listening on http://${HOST}:${PORT}`);
});
