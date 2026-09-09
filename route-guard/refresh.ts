import type { RouteGuardHotzone, RouteGuardRiskLevel, RouteGuardRiskSample } from '../api/route-guard.ts';

export interface RouteLiveRefresh {
  mode: 'route';
  samples: Array<{ id: string; latitude: number; longitude: number }>;
  live: {
    calculatedAt: string;
    samples: Array<{
      liveScore: number;
      contextScore: number;
      contributors: Array<{ incidentId?: string; reason?: string; category?: string }>;
    }>;
  };
}

function level(score: number): RouteGuardRiskLevel {
  return score >= 76 ? 'red' : score >= 46 ? 'amber' : 'low';
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
    || !original.length || response.samples.length !== original.length || response.live.samples.length !== original.length
    || !Number.isFinite(Date.parse(response.live.calculatedAt))) throw new Error('Incomplete live route update.');
  const sampledRiskScores = original.map((sample, index): RouteGuardRiskSample => {
    const point = response.samples[index];
    const reading = response.live.samples[index];
    if (!point || point.id !== String(sample.pointIndex) || point.latitude !== sample.latitude || point.longitude !== sample.longitude
      || !reading || !Number.isFinite(reading.liveScore) || reading.liveScore < 0 || reading.liveScore > 100
      || !Number.isFinite(reading.contextScore) || reading.contextScore < 0 || reading.contextScore > 100
      || !Array.isArray(reading.contributors)) throw new Error('Live route update did not match this journey.');
    const reasons = reading.contributors.map((item) => item.reason).filter((reason): reason is string => typeof reason === 'string');
    return {
      ...sample, score: reading.liveScore, riskLevel: level(reading.liveScore), contributors: reading.contributors,
      basis: `Area and time context: ${reading.contextScore}/100. ${reasons.length ? [...new Set(reasons)].join(' ') : 'No contributing active incidents in the current feed.'}`,
    };
  });
  const hotzoneSections: RouteGuardHotzone[] = [];
  for (const sample of sampledRiskScores) {
    if (sample.riskLevel === 'low') continue;
    hotzoneSections.push({
      id: `live-hotzone-${sample.pointIndex}`, startPointIndex: sample.pointIndex, endPointIndex: sample.pointIndex,
      riskScore: sample.score, riskLevel: sample.riskLevel,
      summary: sample.contextLabel ? `${sample.contextLabel}: ${sample.basis}` : sample.basis,
    });
  }
  const average = sampledRiskScores.reduce((sum, sample) => sum + sample.score, 0) / sampledRiskScores.length;
  const maximum = Math.max(...sampledRiskScores.map((sample) => sample.score));
  const overallRiskScore = Math.round(average * 0.7 + maximum * 0.3);
  return { sampledRiskScores, hotzoneSections, overallRiskScore, overallRiskLevel: level(overallRiskScore) };
}
