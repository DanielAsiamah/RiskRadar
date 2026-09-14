import type { RouteBackgroundState } from './background.ts';
import type { RouteGuardScan } from '../api/route-guard.ts';

export const ROUTE_BACKGROUND_STORAGE_KEY = 'riskradar-route-background-v1';
export const ROUTE_BACKGROUND_MAX_AGE_MS = 4 * 60 * 60 * 1000;

export function createRouteBackgroundState(route: RouteGuardScan, sessionId: string, now: number): RouteBackgroundState {
  const state = {
    sessionId, enabled: true, expiresAt: now + ROUTE_BACKGROUND_MAX_AGE_MS, route,
    lastRefreshAt: 0, alertedKeys: [], lastLocation: null, lastAlert: null, warning: null,
  };
  if (!parseRouteBackgroundState(JSON.stringify(state))) throw new Error('This route cannot be monitored in the background.');
  return state;
}

export function parseRouteBackgroundState(raw: string | null): RouteBackgroundState | null {
  try {
    if (!raw || raw.length > 500_000) return null;
    const value = JSON.parse(raw);
    const route = value?.route;
    const point = (item: any) => item && Number.isFinite(item.latitude) && Math.abs(item.latitude) <= 90
      && Number.isFinite(item.longitude) && Math.abs(item.longitude) <= 180;
    const score = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100;
    const risk = (s: unknown) => ['low', 'amber', 'red'].includes(String(s));
    if (!value || typeof value.sessionId !== 'string' || !value.sessionId || typeof value.enabled !== 'boolean'
      || !Number.isFinite(value.expiresAt) || !Number.isFinite(value.lastRefreshAt)
      || !Array.isArray(value.alertedKeys) || value.alertedKeys.length > 100 || !value.alertedKeys.every((key: unknown) => typeof key === 'string')
      || route?.provider !== 'free-osm' || typeof route.start !== 'string' || typeof route.destination !== 'string'
      || !Array.isArray(route.routePoints) || route.routePoints.length < 2 || route.routePoints.length > 500 || !route.routePoints.every(point)
      || !Array.isArray(route.sampledRiskScores) || route.sampledRiskScores.length < 1 || route.sampledRiskScores.length > 12
      || !route.sampledRiskScores.every((sample: any) => point(sample) && score(sample.score) && risk(sample.riskLevel)
        && Number.isInteger(sample.pointIndex) && sample.pointIndex >= 0 && typeof sample.basis === 'string'
        && (sample.contextLabel === undefined || typeof sample.contextLabel === 'string'))
      || !Array.isArray(route.hotzoneSections) || !route.hotzoneSections.every((zone: any) => zone && typeof zone.id === 'string'
        && typeof zone.summary === 'string' && score(zone.riskScore) && ['amber', 'red'].includes(zone.riskLevel)
        && Number.isInteger(zone.startPointIndex) && Number.isInteger(zone.endPointIndex))
      || !score(route.overallRiskScore) || !risk(route.overallRiskLevel)
      || !Number.isFinite(route.distanceEstimate?.kilometres) || !Number.isFinite(route.durationEstimate?.minutes)
      || typeof route.disclaimer !== 'string') return null;
    if (route.geocoded !== undefined && (typeof route.geocoded?.start?.label !== 'string' || typeof route.geocoded?.destination?.label !== 'string')) return null;
    if (route.routeProvider !== undefined && typeof route.routeProvider?.modeDisclosure !== 'string') return null;
    if (route.fallbackReason !== undefined && typeof route.fallbackReason !== 'string') return null;
    if (value.warning !== null && typeof value.warning !== 'string') return null;
    if (value.lastLocation !== null && (!point(value.lastLocation) || !Number.isFinite(value.lastLocation.timestamp)
      || (value.lastLocation.accuracyMetres !== null && (!Number.isFinite(value.lastLocation.accuracyMetres) || value.lastLocation.accuracyMetres < 0)))) return null;
    if (value.lastAlert !== null && (!value.lastAlert || typeof value.lastAlert.title !== 'string'
      || typeof value.lastAlert.body !== 'string' || typeof value.lastAlert.key !== 'string'
      || !risk(value.lastAlert.level) || !Number.isFinite(value.lastAlert.createdAt)
      || typeof value.lastAlert.notificationSent !== 'boolean')) return null;
    return value as RouteBackgroundState;
  } catch {
    return null;
  }
}
