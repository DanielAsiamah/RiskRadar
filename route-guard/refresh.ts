import type { RouteGuardHotzone, RouteGuardRiskLevel, RouteGuardRiskSample } from '../api/route-guard.ts';
import { buildLiveIncidentMarkers } from '../live-incidents/presentation.ts';
import { describeRouteLiveData, readRouteLiveData, type RouteLiveData } from './live-data.ts';

export interface RouteLiveRefresh {
  mode: 'route';
  samples: Array<{ id: string; latitude: number; longitude: number }>;
  incidents: unknown[];
  liveData?: RouteLiveData;
  live: {
    calculatedAt: string;
    samples: Array<{
      dataAvailable?: boolean;
      liveScore: number | null;
      contextScore: number | null;
      contributors: Array<{ incidentId?: string; reason?: string; category?: string }>;
    }>;
  };
}

function level(score: number): RouteGuardRiskLevel {
  return score >= 76 ? 'red' : score >= 46 ? 'amber' : 'low';
}

function validScore(score: unknown): score is number {
  return typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100;
}

export function startRouteRiskPolling(input: {
  request(signal: AbortSignal): Promise<RouteLiveRefresh>;
  onValue(value: RouteLiveRefresh): void;
  onError(error: unknown): void;
  schedule?: (callback: () => void) => () => void;
}) {
  let active = true;
  const controller = new AbortController();
  let cancelNext: (() => void) | undefined;
  const schedule = input.schedule ?? ((callback: () => void) => {
    const timer = setTimeout(callback, 60_000);
    return () => clearTimeout(timer);
  });
  const refresh = async () => {
    if (!active) return;
    try {
      const value = await input.request(controller.signal);
      if (active) input.onValue(value);
    } catch (error) {
      if (active) input.onError(error);
    } finally {
      if (active) cancelNext = schedule(() => { void refresh(); });
    }
  };
  void refresh();
  return () => {
    active = false;
    controller.abort();
    cancelNext?.();
  };
}

export function applyRouteLiveRefresh(original: RouteGuardRiskSample[], response: RouteLiveRefresh) {
  if (response?.mode !== 'route' || !Array.isArray(response.samples) || !Array.isArray(response.live?.samples)
    || !Array.isArray(response.incidents)
    || !original.length || response.samples.length !== original.length || response.live.samples.length !== original.length
    || !Number.isFinite(Date.parse(response.live.calculatedAt))) throw new Error('Incomplete live route update.');
  const liveData = readRouteLiveData(response.liveData);
  const sourceStatus = describeRouteLiveData(liveData, Date.parse(response.live.calculatedAt));
  const coverageNote = sourceStatus.status === 'unavailable'
    ? 'Live sources unavailable; current conditions could not be confirmed.'
    : 'Live coverage is limited to the named sources and their listed areas.';
  const sampledRiskScores = original.map((sample, index): RouteGuardRiskSample => {
    const point = response.samples[index];
    const reading = response.live.samples[index];
    if (!point || point.id !== String(sample.pointIndex) || point.latitude !== sample.latitude || point.longitude !== sample.longitude
      || !reading || (reading.dataAvailable !== undefined && typeof reading.dataAvailable !== 'boolean')
      || !Array.isArray(reading.contributors) || reading.contributors.some((item) => !item || typeof item !== 'object')) {
      throw new Error('Live route update did not match this journey.');
    }
    const reasons = reading.contributors.map((item) => item.reason).filter((reason): reason is string => typeof reason === 'string');
    if (reading.dataAvailable === false) {
      if (reading.liveScore !== null || reading.contextScore !== null) throw new Error('Unavailable route readings must contain null scores.');
      return {
        ...sample, score: null, riskLevel: 'unknown', contributors: reading.contributors,
        basis: `Risk data is unavailable for this section; no score is assigned. ${[...new Set(reasons)].join(' ')} ${coverageNote}`.replace(/\s+/g, ' ').trim(),
      };
    }
    if (!validScore(reading.liveScore) || !validScore(reading.contextScore)) throw new Error('Live route update contained invalid scores.');
    return {
      ...sample, score: reading.liveScore, riskLevel: level(reading.liveScore), contributors: reading.contributors,
      basis: `Area and time context: ${reading.contextScore}/100. ${reasons.length ? [...new Set(reasons)].join(' ') : 'No matching incident in the available reports.'} ${coverageNote}`,
    };
  });
  const hotzoneSections: RouteGuardHotzone[] = [];
  for (const sample of sampledRiskScores) {
    if (sample.score === null || (sample.riskLevel !== 'amber' && sample.riskLevel !== 'red')) continue;
    hotzoneSections.push({
      id: `live-hotzone-${sample.pointIndex}`, startPointIndex: sample.pointIndex, endPointIndex: sample.pointIndex,
      riskScore: sample.score, riskLevel: sample.riskLevel,
      summary: sample.contextLabel ? `${sample.contextLabel}: ${sample.basis}` : sample.basis,
    });
  }
  const scores = sampledRiskScores.map((sample) => sample.score).filter(validScore);
  const overallRiskScore = scores.length === sampledRiskScores.length
    ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 0.7 + Math.max(...scores) * 0.3)
    : null;
  const contributingIncidentIds = new Set(response.live.samples
    .flatMap((sample) => sample.contributors)
    .map((contributor) => contributor.incidentId)
    .filter((incidentId): incidentId is string => typeof incidentId === 'string' && incidentId.length > 0));
  return {
    liveData,
    sampledRiskScores,
    hotzoneSections,
    overallRiskScore,
    overallRiskLevel: overallRiskScore === null ? 'unknown' as const : level(overallRiskScore),
    // Keep the highest-severity map markers within the background storage limit.
    // Evidence at an unscored section stays visible without inventing a numeric alert.
    liveIncidentMarkers: buildLiveIncidentMarkers(response.incidents)
      .filter((marker) => contributingIncidentIds.has(marker.id)).slice(0, 100),
  };
}
