import type { LiveRadarAlertEvent, LiveRadarReading } from './types.ts';

export interface LiveSourceNetworkSnapshot {
  network?: {
    status?: string;
    persistent?: boolean;
    durability?: string;
    disclosure?: string;
  };
  sources?: Array<{
    sourceId?: string;
    id?: string;
    state?: string;
  }>;
  incidents?: Array<{
    id?: string;
    title?: string;
    verificationLevel?: string;
  }>;
}

export interface LiveSourceNetworkSummary {
  tone: 'healthy' | 'limited';
  title: string;
  metric: string;
  detail: string;
  disclosure: string;
}

export function findCurrentLiveRadarAlert(
  reading: LiveRadarReading | null,
  history: LiveRadarAlertEvent[],
) {
  if (!reading) return null;
  return history.find((event) => (
    event.createdAt === reading.checkedAt
    && event.postcode === reading.postcode
    && event.score === reading.score
  )) ?? null;
}

export function formatLiveRadarDataMonth(value: string | null) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '');
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatLiveSourceNetworkSummary(snapshot: LiveSourceNetworkSnapshot | null): LiveSourceNetworkSummary {
  const sources = Array.isArray(snapshot?.sources) ? snapshot.sources : [];
  const incidents = Array.isArray(snapshot?.incidents) ? snapshot.incidents : [];
  const healthySources = sources.filter((source) => source.state === 'healthy').length;
  const activeIncidents = incidents.length;
  const networkHealthy = snapshot?.network?.status === 'healthy' || healthySources > 0;
  const disclosure = String(snapshot?.network?.disclosure || '').trim()
    || 'Live network status is reported by the RiskRadar backend.';

  if (networkHealthy) {
    return {
      tone: 'healthy',
      title: 'Live safety network online',
      metric: `${activeIncidents} active`,
      detail: `${pluralize(healthySources, 'live source')} healthy with ${pluralize(activeIncidents, 'active public incident')} currently visible near the monitored area.`,
      disclosure,
    };
  }

  return {
    tone: 'limited',
    title: 'Live network warming up',
    metric: `${activeIncidents} active`,
    detail: activeIncidents > 0
      ? `${pluralize(activeIncidents, 'active public incident')} visible, but no live source is currently reporting a healthy poll.`
      : 'No active public incidents are visible from the live network yet.',
    disclosure,
  };
}

function pluralize(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
