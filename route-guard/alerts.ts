import { formatRouteGuardAlert } from './presentation.ts';
import type { RouteGuardProgressSummary } from './progress.ts';

export interface RouteApproachAlert {
  key: string;
  title: string;
  body: string;
  level: 'amber' | 'red';
}

export function evaluateRouteApproachAlert(input: {
  progress: RouteGuardProgressSummary | null;
  tracking: boolean;
  provider: string;
  accuracyMetres: number | null;
  locationTimestamp: number | null;
  now: number;
  alertedKeys: ReadonlySet<string>;
}): RouteApproachAlert | null {
  const { progress, accuracyMetres, locationTimestamp } = input;
  if (!input.tracking || input.provider !== 'free-osm' || progress?.status !== 'on-route') return null;
  if (accuracyMetres === null || !Number.isFinite(accuracyMetres) || accuracyMetres < 0 || accuracyMetres > 100) return null;
  if (locationTimestamp === null || !Number.isFinite(locationTimestamp) || !Number.isFinite(input.now)
    || input.now - locationTimestamp < 0 || input.now - locationTimestamp > 30_000) return null;
  const sample = progress.upcomingHotzone;
  if (!sample || (sample.riskLevel !== 'amber' && sample.riskLevel !== 'red')) return null;
  const key = `${sample.pointIndex}:${sample.latitude}:${sample.longitude}:${sample.riskLevel}`;
  if (input.alertedKeys.has(key)) return null;
  const presentation = formatRouteGuardAlert(progress);
  return {
    key,
    title: presentation.title,
    body: `${presentation.scoreLabel}. ${presentation.distanceLabel}. ${presentation.detail} ${presentation.action}`,
    level: sample.riskLevel,
  };
}

interface BrowserNotificationConstructor {
  permission: string;
  new(title: string, options: { body: string; tag: string }): unknown;
}

export function deliverRouteNotification(alert: RouteApproachAlert, notifications: BrowserNotificationConstructor | undefined): boolean {
  if (notifications?.permission !== 'granted') return false;
  try {
    new notifications(alert.title, { body: alert.body, tag: `riskradar-route-${alert.key}` });
    return true;
  } catch {
    return false;
  }
}

export async function deliverNativeRouteNotification(alert: RouteApproachAlert, device: {
  permission(): Promise<boolean>;
  show(message: RouteApproachAlert): Promise<void>;
}): Promise<boolean> {
  try {
    if (!await device.permission()) return false;
    await device.show(alert);
    return true;
  } catch {
    return false;
  }
}
