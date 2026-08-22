const PRO_MONTHLY_ROUTE_SCANS = 100;
const SUPPORTED_TRAVEL_MODES = new Set(['walking', 'driving', 'transit']);
const RISK_DISCLAIMER = 'Route Guard provides generated planning estimates for area intelligence, not guaranteed safety, live routing, or incident avoidance.';

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

export function createRouteGuardRouteHandler({ provider = process.env.ROUTE_PROVIDER || 'mock', sendJson = defaultSendJson } = {}) {
  return {
    async handle(request, response, url) {
      if (request.method !== 'POST' || url.pathname !== '/api/route-guard') return false;

      try {
        if (String(provider).trim().toLowerCase() !== 'mock') {
          throw new RouteGuardError(
            'Only the mock Route Guard provider is enabled in this release.',
            503,
            'ROUTE_PROVIDER_UNAVAILABLE',
          );
        }
        const body = await readJsonBody(request);
        sendJson(request, response, 200, createMockRouteGuardScan(body));
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
  defaultProvider: 'mock',
  proMonthlyRouteScans: PRO_MONTHLY_ROUTE_SCANS,
  supportedTravelModes: Object.freeze([...SUPPORTED_TRAVEL_MODES]),
});
