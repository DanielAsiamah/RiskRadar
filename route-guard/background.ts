import type { RouteGuardScan } from '../api/route-guard.ts';
import { evaluateRouteApproachAlert, type RouteApproachAlert } from './alerts.ts';
import { summarizeRouteProgress } from './progress.ts';
import { applyRouteLiveRefresh, type RouteLiveRefresh } from './refresh.ts';
import type { JourneyLocation } from './location-session.ts';

export interface RouteBackgroundState {
  sessionId: string;
  enabled: boolean;
  expiresAt: number;
  route: RouteGuardScan;
  lastRefreshAt: number;
  alertedKeys: string[];
  lastLocation: JourneyLocation | null;
  lastAlert: (RouteApproachAlert & { createdAt: number; notificationSent: boolean }) | null;
  warning: string | null;
}

export interface RouteBackgroundDependencies {
  load(): Promise<RouteBackgroundState | null>;
  save(state: RouteBackgroundState): Promise<void>;
  refresh(route: RouteGuardScan): Promise<RouteLiveRefresh>;
  notify(alert: RouteApproachAlert): Promise<boolean>;
  now(): number;
}

function usable(location: JourneyLocation, now: number) {
  return Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
    && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180
    && location.accuracyMetres !== null && Number.isFinite(location.accuracyMetres)
    && location.accuracyMetres >= 0 && location.accuracyMetres <= 100
    && Number.isFinite(location.timestamp) && now >= location.timestamp && now - location.timestamp <= 30_000;
}

// The native task adapter must serialize invocations and session writes.
export async function processRouteBackgroundUpdate(
  locations: JourneyLocation[], dependencies: RouteBackgroundDependencies,
): Promise<'ignored' | 'warning' | 'updated' | 'alerted'> {
  const initial = await dependencies.load();
  if (!initial?.enabled || initial.expiresAt <= dependencies.now() || initial.route.provider !== 'free-osm') return 'ignored';
  const stillActive = async () => {
    const latest = await dependencies.load();
    return latest?.enabled && latest.sessionId === initial.sessionId && latest.expiresAt > dependencies.now();
  };
  const warn = async (warning: string) => {
    if (!await stillActive()) return 'ignored' as const;
    await dependencies.save({ ...initial, warning });
    return 'warning' as const;
  };
  const location = locations.filter((fix) => usable(fix, dependencies.now()))
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!location) return warn('Waiting for a recent, accurate background GPS reading.');
  if (initial.lastLocation && location.timestamp < initial.lastLocation.timestamp) return 'ignored';

  let route = initial.route;
  let lastRefreshAt = initial.lastRefreshAt;
  if (dependencies.now() - lastRefreshAt >= 60_000) {
    try {
      const response = await dependencies.refresh(route);
      route = { ...route, ...applyRouteLiveRefresh(route.sampledRiskScores, response) };
      lastRefreshAt = dependencies.now();
    } catch {
      return warn('Background route refresh failed. New approach alerts are paused until a refresh succeeds.');
    }
  }
  if (!await stillActive()) return 'ignored';
  const progress = summarizeRouteProgress({
    currentLocation: location, routePoints: route.routePoints,
    routeRiskSamples: route.sampledRiskScores
      .filter((sample) => Number.isFinite(sample.latitude) && Number.isFinite(sample.longitude))
      .map((sample) => ({ ...sample, latitude: sample.latitude!, longitude: sample.longitude! })),
    alertRadiusMetres: 500,
  });
  const alert = evaluateRouteApproachAlert({
    progress, tracking: true, provider: route.provider,
    accuracyMetres: location.accuracyMetres, locationTimestamp: location.timestamp,
    now: dependencies.now(), alertedKeys: new Set(initial.alertedKeys),
  });
  let next: RouteBackgroundState = { ...initial, route, lastRefreshAt, lastLocation: location, warning: null };
  if (alert) {
    let delivered = false;
    try { delivered = await dependencies.notify(alert); } catch { /* The saved alert remains available in-app. */ }
    next = {
      ...next, alertedKeys: [...initial.alertedKeys, alert.key],
      lastAlert: { ...alert, createdAt: dependencies.now(), notificationSent: delivered },
      warning: delivered ? null : 'Route alert recorded, but the device notification could not be delivered.',
    };
  }
  if (!await stillActive()) return 'ignored';
  await dependencies.save(next);
  return alert ? 'alerted' : 'updated';
}
