export type RouteProgressRiskLevel = 'low' | 'amber' | 'red';

export interface RouteProgressPoint {
  latitude: number;
  longitude: number;
}

export interface RouteProgressSample extends RouteProgressPoint {
  pointIndex: number;
  score: number;
  riskLevel: RouteProgressRiskLevel;
  basis: string;
  contextLabel?: string;
}

export interface RouteGuardProgressInput {
  currentLocation: RouteProgressPoint;
  routePoints: RouteProgressPoint[];
  routeRiskSamples: RouteProgressSample[];
  alertRadiusMetres?: number;
  offRouteThresholdMetres?: number;
}

export interface RouteGuardProgressSummary {
  status: 'on-route' | 'off-route';
  distanceToRouteMetres: number;
  nearestSample?: RouteProgressSample & { distanceMetres: number };
  upcomingHotzone?: RouteProgressSample & { distanceMetres: number };
  message: string;
}

const EARTH_RADIUS_METRES = 6_371_000;
const DEFAULT_ALERT_RADIUS_METRES = 450;
const DEFAULT_OFF_ROUTE_THRESHOLD_METRES = 600;

export function summarizeRouteProgress(input: RouteGuardProgressInput): RouteGuardProgressSummary {
  const alertRadiusMetres = input.alertRadiusMetres ?? DEFAULT_ALERT_RADIUS_METRES;
  const offRouteThresholdMetres = input.offRouteThresholdMetres ?? DEFAULT_OFF_ROUTE_THRESHOLD_METRES;
  const routePoints = input.routePoints.filter(isUsablePoint);
  const routeRiskSamples = input.routeRiskSamples.filter(isUsableSample);

  if (!routePoints.length && !routeRiskSamples.length) {
    return {
      status: 'off-route',
      distanceToRouteMetres: Number.POSITIVE_INFINITY,
      message: 'RiskRadar does not have enough route geometry to track this journey yet.',
    };
  }

  const geometry = routePoints.length ? routePoints : routeRiskSamples;
  const position = projectOntoRoute(input.currentLocation, geometry);
  const distanceToRouteMetres = position.distanceMetres;
  const nearestSample = findNearestSample(input.currentLocation, routeRiskSamples);

  if (distanceToRouteMetres > offRouteThresholdMetres) {
    return {
      status: 'off-route',
      distanceToRouteMetres,
      nearestSample,
      message: `You are about ${formatDistance(distanceToRouteMetres)} away from the scanned route. Re-scan if your route changed.`,
    };
  }

  const upcomingHotzone = routeRiskSamples
    .filter((sample) => sample.riskLevel === 'amber' || sample.riskLevel === 'red')
    .map((sample) => ({
      ...sample,
      distanceMetres: projectOntoRoute(sample, geometry).alongMetres - position.alongMetres,
    }))
    .filter((sample) => sample.distanceMetres >= 0 && sample.distanceMetres <= alertRadiusMetres)
    .sort((first, second) => first.distanceMetres - second.distanceMetres)[0];

  if (upcomingHotzone) {
    const basis = formatBasis(upcomingHotzone.basis);
    const context = formatContextLabel(upcomingHotzone.contextLabel);
    return {
      status: 'on-route',
      distanceToRouteMetres,
      nearestSample,
      upcomingHotzone,
      message: `Approaching elevated route section${context} in about ${formatDistance(upcomingHotzone.distanceMetres)}: ${upcomingHotzone.score}/100 ${upcomingHotzone.riskLevel.toUpperCase()}${basis}.`,
    };
  }

  const currentRisk = nearestSample
    ? `${nearestSample.score}/100 ${nearestSample.riskLevel.toUpperCase()} near your current route position.`
    : 'No route risk sample is close to your current position yet.';

  return {
    status: 'on-route',
    distanceToRouteMetres,
    nearestSample,
    message: `You are tracking the scanned route. ${currentRisk}`,
  };
}

export function distanceMetres(from: RouteProgressPoint, to: RouteProgressPoint): number {
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const latDelta = toRadians(to.latitude - from.latitude);
  const lonDelta = toRadians(to.longitude - from.longitude);
  const a = Math.sin(latDelta / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(lonDelta / 2) ** 2;
  return EARTH_RADIUS_METRES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestSample(currentLocation: RouteProgressPoint, samples: RouteProgressSample[]) {
  return samples
    .map((sample) => ({ ...sample, distanceMetres: distanceMetres(currentLocation, sample) }))
    .sort((first, second) => first.distanceMetres - second.distanceMetres)[0];
}

function projectOntoRoute(location: RouteProgressPoint, points: RouteProgressPoint[]) {
  let best = { distanceMetres: distanceMetres(location, points[0]), alongMetres: 0 };
  let accumulated = 0;
  // Project onto each segment in a local metre grid; sample indexes are not geometry indexes.
  const longitudeScale = Math.cos(toRadians(location.latitude));
  const toLocal = (point: RouteProgressPoint) => ({
    x: toRadians(point.longitude - location.longitude) * EARTH_RADIUS_METRES * longitudeScale,
    y: toRadians(point.latitude - location.latitude) * EARTH_RADIUS_METRES,
  });
  for (let index = 1; index < points.length; index += 1) {
    const start = toLocal(points[index - 1]);
    const end = toLocal(points[index]);
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const fraction = lengthSquared ? Math.max(0, Math.min(1, -(start.x * dx + start.y * dy) / lengthSquared)) : 0;
    const distance = Math.hypot(start.x + fraction * dx, start.y + fraction * dy);
    const length = distanceMetres(points[index - 1], points[index]);
    if (distance < best.distanceMetres) {
      best = { distanceMetres: distance, alongMetres: accumulated + fraction * length };
    }
    accumulated += length;
  }
  return best;
}

function isUsablePoint(point: RouteProgressPoint) {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function isUsableSample(sample: RouteProgressSample) {
  return isUsablePoint(sample) && Number.isFinite(sample.pointIndex) && Number.isFinite(sample.score);
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function formatDistance(metres: number) {
  if (!Number.isFinite(metres)) return 'an unknown distance';
  if (metres >= 1_000) return `${(metres / 1_000).toFixed(1)} km`;
  return `${Math.max(1, Math.round(metres))} m`;
}

function formatBasis(basis: string) {
  const cleaned = basis.trim();
  if (!cleaned) return '';
  return ` - ${cleaned}`;
}

function formatContextLabel(contextLabel?: string) {
  const cleaned = String(contextLabel || '').trim();
  if (!cleaned) return '';
  return ` near ${cleaned.replace(/^near\s+/i, '')}`;
}
