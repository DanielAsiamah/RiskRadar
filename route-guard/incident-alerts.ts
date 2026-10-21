import type { RouteGuardRiskSample } from '../api/route-guard.ts';
import type { RouteApproachAlert } from './alerts.ts';
import { describeRouteLiveData, readRouteLiveData, type RouteLiveData } from './live-data.ts';
import { projectOntoRoute, type RouteProgressPoint } from './progress.ts';

export interface RouteIncidentContext {
  currentLocation: RouteProgressPoint;
  routePoints: RouteProgressPoint[];
  samples: RouteGuardRiskSample[];
  liveData?: RouteLiveData;
}

interface IncidentEvidence {
  incidentId: string;
  version: number;
  provider: string;
  title: string;
  locationLabel: string;
  severity: number;
  verificationLabel: 'Official' | 'Corroborated';
  observedAt: string;
  expiresAt: string;
  sourceUrl?: string;
}

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 300;
const point = (value: any): value is RouteProgressPoint => value && Number.isFinite(value.latitude)
  && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;

export function safeIncidentSourceUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch { return undefined; }
}

function readEvidence(value: unknown, now: number): IncidentEvidence | null {
  if (!value || typeof value !== 'object') return null;
  const evidence = value as IncidentEvidence;
  if (![evidence.incidentId, evidence.provider, evidence.title, evidence.locationLabel].every(text)
    || !Number.isInteger(evidence.version) || evidence.version < 1
    || !Number.isInteger(evidence.severity) || evidence.severity < 3 || evidence.severity > 5
    || !['Official', 'Corroborated'].includes(evidence.verificationLabel)
    || typeof evidence.observedAt !== 'string' || !Number.isFinite(Date.parse(evidence.observedAt))
    || Date.parse(evidence.observedAt) > now + 60_000
    || typeof evidence.expiresAt !== 'string' || !Number.isFinite(Date.parse(evidence.expiresAt))
    || Date.parse(evidence.expiresAt) <= now) return null;
  return { ...evidence, sourceUrl: safeIncidentSourceUrl(evidence.sourceUrl) };
}

export function evaluateIncidentApproach(context: RouteIncidentContext, now: number, alertedKeys: ReadonlySet<string>): RouteApproachAlert | null {
  const data = readRouteLiveData(context.liveData);
  const health = describeRouteLiveData(data, now);
  if (!data || health.status !== 'limited' || !point(context.currentLocation)
    || context.routePoints.length < 2 || !context.routePoints.every(point)) return null;
  const freshSources = data.sources.filter((source) => health.sources.some((item) => item.id === source.sourceId && item.state === 'healthy'));
  const position = projectOntoRoute(context.currentLocation, context.routePoints);
  if (position.distanceMetres > 600) return null;
  const candidates: Array<{ evidence: IncidentEvidence; distance: number; source: string }> = [];
  for (const sample of context.samples) {
    if (!point(sample) || !Array.isArray(sample.contributors)) continue;
    const projected = projectOntoRoute(sample, context.routePoints);
    const distance = projected.alongMetres - position.alongMetres;
    if (projected.distanceMetres > 100 || distance < 0 || distance > 500) continue;
    for (const contributor of sample.contributors) {
      const evidence = readEvidence(contributor?.incidentAlert, now);
      if (!evidence || contributor.incidentId !== evidence.incidentId) continue;
      const source = freshSources.find((item) => item.provider === evidence.provider
        && item.staleAfterMs !== null && now - Date.parse(evidence.observedAt) < item.staleAfterMs);
      if (!source) continue;
      // A provider's routine version update is not a new reason to notify.
      const prefix = `incident:${encodeURIComponent(evidence.incidentId)}:`;
      if ([...alertedKeys].some((key) => key.startsWith(prefix) && Number(key.split(':').at(-1)) >= evidence.severity)) continue;
      candidates.push({ evidence, distance, source: source.label });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || b.evidence.severity - a.evidence.severity
    || a.evidence.incidentId.localeCompare(b.evidence.incidentId));
  const candidate = candidates[0];
  if (!candidate) return null;
  const { evidence, distance, source } = candidate;
  return {
    key: `incident:${encodeURIComponent(evidence.incidentId)}:${evidence.version}:${evidence.severity}`,
    title: `${evidence.title} ahead`,
    body: `${evidence.verificationLabel} report from ${source}: ${evidence.locationLabel}. About ${Math.max(1, Math.round(distance))} m to an affected route section. Follow official advice; conditions can change.`,
    level: evidence.severity >= 4 ? 'red' : 'amber',
    incidentId: evidence.incidentId, sourceUrl: evidence.sourceUrl, observedAt: evidence.observedAt,
  };
}
