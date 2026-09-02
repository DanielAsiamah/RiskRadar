const PRO_MONTHLY_ROUTE_SCANS = 100;
const SUPPORTED_TRAVEL_MODES = new Set(['walking', 'driving', 'transit']);
const RISK_DISCLAIMER = 'Route Guard provides generated planning estimates for area intelligence, not guaranteed safety, live routing, or incident avoidance.';
const FREE_ROUTE_DISCLAIMER = 'Route Guard provides current area intelligence from free public map sources and RiskRadar data. It is not an emergency service and does not guarantee that a place or route is safe.';
const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const OSRM_ENDPOINT = 'https://router.project-osrm.org/route/v1';
const ROUTE_GUARD_USER_AGENT = process.env.ROUTE_GUARD_USER_AGENT
  || 'RiskRadar/1.0 route-guard (contact: supr3ltd@gmail.com)';

export class RouteGuardError extends Error {
  constructor(message, statusCode = 400, code = 'INVALID_ROUTE_GUARD_INPUT') {
    super(message);
    this.name = 'RouteGuardError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function round(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function riskLevel(score) {
  if (score >= 76) return 'red';
  if (score >= 46) return 'amber';
  return 'low';
}

function routeRiskLevel(score) {
  return riskLevel(score) === 'high' ? 'red' : riskLevel(score);
}

function validateInput(input) {
  const start = String(input?.start || '').trim();
  const destination = String(input?.destination || '').trim();
  const travelMode = String(input?.travelMode || '').trim().toLowerCase();
  const entitlement = String(input?.entitlement || '').trim().toLowerCase();
  const routeScansUsed = Number(input?.routeScansUsed);

  if (!start || !destination) {
    throw new RouteGuardError('Start and destination are required.');
  }
  if (!SUPPORTED_TRAVEL_MODES.has(travelMode)) {
    throw new RouteGuardError('Travel mode must be walking, driving, or transit.');
  }
  if (!Number.isInteger(routeScansUsed) || routeScansUsed < 0) {
    throw new RouteGuardError('routeScansUsed must be a non-negative integer.');
  }
  if (entitlement !== 'pro') {
    throw new RouteGuardError('Route Guard is included with RiskRadar PRO.', 403, 'PREMIUM_REQUIRED');
  }
  if (routeScansUsed >= PRO_MONTHLY_ROUTE_SCANS) {
    throw new RouteGuardError(
      'The 100 Route Guard scans included this month have been used.',
      429,
      'ROUTE_SCAN_LIMIT_REACHED',
    );
  }

  return { start, destination, travelMode, entitlement, routeScansUsed };
}

function buildRoutePoints(seed, start, destination) {
  const pointCount = 8;
  const origin = {
    latitude: 50.9 + (seed % 9000) / 10000,
    longitude: -2.4 + ((seed >>> 7) % 3500) / 1000,
  };
  const latitudeDelta = 0.025 + ((seed >>> 11) % 45) / 1000;
  const longitudeDelta = 0.035 + ((seed >>> 17) % 70) / 1000;
  const curveDirection = seed % 2 === 0 ? 1 : -1;

  return Array.from({ length: pointCount }, (_, index) => {
    const progress = index / (pointCount - 1);
    const curve = Math.sin(progress * Math.PI) * 0.012 * curveDirection;
    return {
      index,
      latitude: round(origin.latitude + latitudeDelta * progress + curve),
      longitude: round(origin.longitude + longitudeDelta * progress - curve / 2),
      label: index === 0 ? start : index === pointCount - 1 ? destination : `Route preview sample ${index}`,
    };
  });
}

function buildSampledRiskScores(seed, routePoints) {
  return routePoints.map((point, index) => {
    const score = 22 + ((seed >>> (index % 24)) + index * 19) % 67;
    return {
      pointIndex: point.index,
      score,
      riskLevel: riskLevel(score),
      basis: 'Generated planning-preview area-risk sample',
    };
  });
}

function buildHotzoneSections(samples) {
  const sections = [];
  let sectionStart = null;

  for (let index = 0; index <= samples.length; index += 1) {
    const sample = samples[index];
    if (sample?.score >= 60 && sectionStart === null) sectionStart = index;
    if ((!sample || sample.score < 60) && sectionStart !== null) {
      const sectionSamples = samples.slice(sectionStart, index);
      const highest = sectionSamples.reduce((current, candidate) => candidate.score > current.score ? candidate : current);
      sections.push({
        id: `hotzone-${sections.length + 1}`,
        startPointIndex: sectionStart,
        endPointIndex: index - 1,
        riskScore: highest.score,
        riskLevel: riskLevel(highest.score),
        summary: `${riskLevel(highest.score) === 'red' ? 'Higher' : 'Elevated'} planning-preview area-risk section`,
      });
      sectionStart = null;
    }
  }

  return sections;
}

function normalizePoint(value, field) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    throw new RouteGuardError(`${field} must include valid latitude and longitude.`, 502, 'ROUTE_PROVIDER_BAD_RESPONSE');
  }
  return { latitude: round(latitude), longitude: round(longitude) };
}

function downsampleRoutePoints(points, maximum = 80) {
  const normalized = points.map((point, index) => ({ ...normalizePoint(point, `routePoints[${index}]`) }));
  if (normalized.length <= maximum) return normalized;
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.round((index / (maximum - 1)) * (normalized.length - 1));
    return normalized[sourceIndex];
  });
}

function selectRiskSamplePoints(routePoints, maximum = 12) {
  if (routePoints.length <= maximum) return routePoints;
  return Array.from({ length: maximum }, (_, index) => {
    const sourceIndex = Math.round((index / (maximum - 1)) * (routePoints.length - 1));
    return routePoints[sourceIndex];
  });
}

function normalizeRiskSample(value, index) {
  const score = Math.max(0, Math.min(100, Math.round(Number(value?.score))));
  if (!Number.isFinite(score)) {
    throw new RouteGuardError(`Risk sample ${index + 1} did not include a valid score.`, 502, 'ROUTE_RISK_BAD_RESPONSE');
  }
  return {
    score,
    riskLevel: routeRiskLevel(score),
    basis: String(value?.basis || 'RiskRadar route sample').trim(),
    contributors: Array.isArray(value?.contributors) ? value.contributors : [],
  };
}

function routingProfileFor(travelMode) {
  if (travelMode === 'driving') return 'driving';
  return 'foot';
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function routeProviderMetadata(route, travelMode, routingProfile) {
  return {
    source: route.provider || 'free-osm',
    routingMode: route.routingMode || routingProfile,
    attribution: route.attribution || 'OpenStreetMap contributors; OSRM',
    modeDisclosure: travelMode === 'transit'
      ? 'Transit routing is estimated using a walking corridor until live public-transport routing is connected.'
      : 'Route geometry is generated by free public routing infrastructure.',
  };
}

async function defaultSampleRisk(_point, index) {
  return {
    score: 25 + (index % 3) * 5,
    basis: 'Route geometry only; backend risk sampler unavailable.',
    contributors: [],
  };
}

async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': ROUTE_GUARD_USER_AGENT,
      },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new RouteGuardError(`Route provider returned HTTP ${response.status}.`, 502, 'ROUTE_PROVIDER_FAILED');
    try {
      return JSON.parse(text);
    } catch {
      throw new RouteGuardError('Route provider returned unreadable JSON.', 502, 'ROUTE_PROVIDER_BAD_RESPONSE');
    }
  } catch (error) {
    if (error instanceof RouteGuardError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new RouteGuardError('The free route provider timed out.', 504, 'ROUTE_PROVIDER_TIMEOUT');
    }
    throw new RouteGuardError('RiskRadar could not reach the free route provider.', 502, 'ROUTE_PROVIDER_FAILED');
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodeUkLocation(query) {
  const url = new URL(NOMINATIM_ENDPOINT);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'gb');
  url.searchParams.set('q', query);
  const results = await fetchJson(url);
  const first = Array.isArray(results) ? results[0] : null;
  if (!first) throw new RouteGuardError(`No UK route location was found for "${query}".`, 404, 'ROUTE_LOCATION_NOT_FOUND');
  return {
    query,
    label: String(first.display_name || query),
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    confidence: Number(first.importance) >= 0.4 ? 'high' : 'medium',
    source: 'nominatim',
  };
}

export async function fetchFreeOsmRoute({ startPoint, destinationPoint, routingProfile }) {
  const start = normalizePoint(startPoint, 'startPoint');
  const destination = normalizePoint(destinationPoint, 'destinationPoint');
  const profile = ['driving', 'foot'].includes(routingProfile) ? routingProfile : 'foot';
  const coordinates = `${start.longitude},${start.latitude};${destination.longitude},${destination.latitude}`;
  const url = new URL(`${OSRM_ENDPOINT}/${profile}/${coordinates}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('steps', 'false');
  url.searchParams.set('alternatives', 'false');
  const payload = await fetchJson(url);
  const route = payload?.routes?.[0];
  const coordinatesList = route?.geometry?.coordinates;
  if (!Array.isArray(coordinatesList) || coordinatesList.length < 2) {
    throw new RouteGuardError('The free route provider did not return a usable route shape.', 502, 'ROUTE_PROVIDER_BAD_RESPONSE');
  }
  return {
    provider: 'free-osm',
    routingMode: profile,
    distanceMetres: Number(route.distance),
    durationSeconds: Number(route.duration),
    routePoints: coordinatesList.map((coordinate) => ({
      latitude: Number(coordinate?.[1]),
      longitude: Number(coordinate?.[0]),
    })),
    attribution: 'OpenStreetMap contributors; OSRM',
  };
}

function estimateDistance(seed) {
  return 1800 + (seed % 16800);
}

function estimateDurationMinutes(distanceMetres, travelMode) {
  const metresPerMinute = {
    walking: 78,
    driving: 430,
    transit: 300,
  }[travelMode];
  return Math.max(4, Math.round(distanceMetres / metresPerMinute));
}

function durationEstimateMinutes(distanceMetres, durationSeconds, travelMode) {
  const routeMinutes = Number.isFinite(durationSeconds) && durationSeconds > 0
    ? Math.round(durationSeconds / 60)
    : 0;
  const modeFloor = estimateDurationMinutes(Number.isFinite(distanceMetres) ? distanceMetres : 0, travelMode);
  if (travelMode === 'driving') return Math.max(1, routeMinutes || modeFloor);
  return Math.max(modeFloor, routeMinutes);
}

export function createMockRouteGuardScan(input) {
  const validated = validateInput(input);
  const seed = stableHash(`${validated.start}|${validated.destination}|${validated.travelMode}`.toLowerCase());
  const routePoints = buildRoutePoints(seed, validated.start, validated.destination);
  const sampledRiskScores = buildSampledRiskScores(seed, routePoints);
  const hotzoneSections = buildHotzoneSections(sampledRiskScores);
  const distanceMetres = estimateDistance(seed);
  const averageRisk = Math.round(sampledRiskScores.reduce((sum, sample) => sum + sample.score, 0) / sampledRiskScores.length);
  const maximumRisk = Math.max(...sampledRiskScores.map((sample) => sample.score));
  const overallScore = Math.round(averageRisk * 0.7 + maximumRisk * 0.3);

  return {
    provider: 'mock',
    googleRequestMade: false,
    start: validated.start,
    destination: validated.destination,
    travelMode: validated.travelMode,
    routePoints,
    distanceEstimate: {
      metres: distanceMetres,
      kilometres: round(distanceMetres / 1000, 1),
    },
    durationEstimate: {
      minutes: estimateDurationMinutes(distanceMetres, validated.travelMode),
    },
    sampledRiskScores,
    hotzoneSections,
    overallRiskScore: overallScore,
    overallRiskLevel: riskLevel(overallScore),
    usage: {
      entitlement: 'pro',
      includedMonthlyScans: PRO_MONTHLY_ROUTE_SCANS,
      usedBefore: validated.routeScansUsed,
      usedAfter: validated.routeScansUsed + 1,
      remaining: PRO_MONTHLY_ROUTE_SCANS - validated.routeScansUsed - 1,
      period: 'calendar-month',
    },
    googleCostEstimate: {
      currency: 'USD',
      estimatedRequests: 1,
      estimatedCostUsd: 0.01,
      note: 'Planning estimate for a future provider integration only; no Google request was made.',
    },
    disclaimer: RISK_DISCLAIMER,
  };
}

export async function createFreeRouteGuardScan(input, {
  geocodeLocation = geocodeUkLocation,
  fetchRoute = fetchFreeOsmRoute,
  sampleRisk = defaultSampleRisk,
} = {}) {
  const validated = validateInput(input);
  let startLocation;
  let destinationLocation;
  if (geocodeLocation === geocodeUkLocation) {
    startLocation = await geocodeLocation(validated.start);
    await wait(1100);
    destinationLocation = await geocodeLocation(validated.destination);
  } else {
    [startLocation, destinationLocation] = await Promise.all([
      geocodeLocation(validated.start),
      geocodeLocation(validated.destination),
    ]);
  }
  const startPoint = normalizePoint(startLocation, 'start geocode result');
  const destinationPoint = normalizePoint(destinationLocation, 'destination geocode result');
  const routingProfile = routingProfileFor(validated.travelMode);
  const route = await fetchRoute({
    startPoint,
    destinationPoint,
    travelMode: validated.travelMode,
    routingProfile,
  });
  const routePoints = downsampleRoutePoints(route.routePoints || []);
  if (routePoints.length < 2) {
    throw new RouteGuardError('The free route provider returned too few route points.', 502, 'ROUTE_PROVIDER_BAD_RESPONSE');
  }
  const riskPoints = selectRiskSamplePoints(routePoints);
  const sampledRiskScores = await Promise.all(riskPoints.map(async (point, index) => {
    let risk;
    try {
      risk = normalizeRiskSample(await sampleRisk(point, index), index);
    } catch {
      risk = {
        score: 35,
        riskLevel: 'low',
        basis: 'RiskRadar sample temporarily unavailable; route geometry is still shown.',
        contributors: [],
      };
    }
    return {
      pointIndex: index,
      latitude: point.latitude,
      longitude: point.longitude,
      score: risk.score,
      riskLevel: risk.riskLevel,
      basis: risk.basis,
      contributors: risk.contributors,
    };
  }));
  const hotzoneSections = buildHotzoneSections(sampledRiskScores);
  const distanceMetres = Number(route.distanceMetres);
  const durationSeconds = Number(route.durationSeconds);
  const averageRisk = Math.round(sampledRiskScores.reduce((sum, sample) => sum + sample.score, 0) / sampledRiskScores.length);
  const maximumRisk = Math.max(...sampledRiskScores.map((sample) => sample.score));
  const overallScore = Math.round(averageRisk * 0.7 + maximumRisk * 0.3);

  return {
    provider: 'free-osm',
    googleRequestMade: false,
    start: validated.start,
    destination: validated.destination,
    travelMode: validated.travelMode,
    geocoded: {
      start: { ...startPoint, label: String(startLocation.label || validated.start), confidence: startLocation.confidence || 'medium', source: startLocation.source || 'unknown' },
      destination: { ...destinationPoint, label: String(destinationLocation.label || validated.destination), confidence: destinationLocation.confidence || 'medium', source: destinationLocation.source || 'unknown' },
    },
    routeProvider: routeProviderMetadata(route, validated.travelMode, routingProfile),
    routePoints: routePoints.map((point, index) => ({
      index,
      latitude: point.latitude,
      longitude: point.longitude,
      label: index === 0 ? validated.start : index === routePoints.length - 1 ? validated.destination : `Route point ${index + 1}`,
    })),
    distanceEstimate: {
      metres: Number.isFinite(distanceMetres) && distanceMetres > 0 ? Math.round(distanceMetres) : 0,
      kilometres: Number.isFinite(distanceMetres) && distanceMetres > 0 ? round(distanceMetres / 1000, 1) : 0,
    },
    durationEstimate: {
      minutes: durationEstimateMinutes(distanceMetres, durationSeconds, validated.travelMode),
    },
    sampledRiskScores,
    hotzoneSections,
    overallRiskScore: overallScore,
    overallRiskLevel: routeRiskLevel(overallScore),
    usage: {
      entitlement: 'pro',
      includedMonthlyScans: PRO_MONTHLY_ROUTE_SCANS,
      usedBefore: validated.routeScansUsed,
      usedAfter: validated.routeScansUsed + 1,
      remaining: PRO_MONTHLY_ROUTE_SCANS - validated.routeScansUsed - 1,
      period: 'calendar-month',
    },
    googleCostEstimate: {
      currency: 'USD',
      estimatedRequests: 0,
      estimatedCostUsd: 0,
      note: 'No Google request was made. This scan used free backend routing sources.',
    },
    disclaimer: FREE_ROUTE_DISCLAIMER,
  };
}

async function readJsonBody(request, maxBytes = 32 * 1024) {
  let body = '';
  for await (const chunk of request) {
    body += chunk.toString('utf8');
    if (Buffer.byteLength(body) > maxBytes) {
      throw new RouteGuardError('Route Guard request body is too large.');
    }
  }

  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new RouteGuardError('Route Guard request body must be valid JSON.');
  }
}

function defaultSendJson(_request, response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

export function createRouteGuardRouteHandler({
  provider = process.env.ROUTE_PROVIDER || 'mock',
  sendJson = defaultSendJson,
  geocodeLocation,
  fetchRoute,
  sampleRisk,
  fallbackToMock = process.env.ROUTE_GUARD_FALLBACK_TO_MOCK !== 'false',
} = {}) {
  return {
    async handle(request, response, url) {
      if (request.method !== 'POST' || url.pathname !== '/api/route-guard') return false;

      try {
        const selectedProvider = String(provider).trim().toLowerCase();
        const body = await readJsonBody(request);
        if (selectedProvider === 'mock') {
          sendJson(request, response, 200, createMockRouteGuardScan(body));
          return true;
        }
        if (['free-osm', 'osm', 'free'].includes(selectedProvider)) {
          try {
            sendJson(request, response, 200, await createFreeRouteGuardScan(body, { geocodeLocation, fetchRoute, sampleRisk }));
          } catch (error) {
            if (!fallbackToMock || error instanceof RouteGuardError && ['PREMIUM_REQUIRED', 'ROUTE_SCAN_LIMIT_REACHED', 'INVALID_ROUTE_GUARD_INPUT'].includes(error.code)) {
              throw error;
            }
            sendJson(request, response, 200, {
              ...createMockRouteGuardScan(body),
              fallbackReason: error instanceof Error ? error.message : 'The free route provider was unavailable.',
            });
          }
          return true;
        }
        {
          throw new RouteGuardError(
            'Only mock and free-osm Route Guard providers are enabled in this release.',
            503,
            'ROUTE_PROVIDER_UNAVAILABLE',
          );
        }
      } catch (error) {
        const routeError = error instanceof RouteGuardError
          ? error
          : new RouteGuardError('Route Guard could not build this mock route.', 500, 'ROUTE_GUARD_FAILED');
        sendJson(request, response, routeError.statusCode, {
          error: routeError.message,
          code: routeError.code,
        });
      }
      return true;
    },
  };
}

export const routeGuardConfig = Object.freeze({
  defaultProvider: 'free-osm',
  proMonthlyRouteScans: PRO_MONTHLY_ROUTE_SCANS,
  supportedTravelModes: Object.freeze([...SUPPORTED_TRAVEL_MODES]),
});
