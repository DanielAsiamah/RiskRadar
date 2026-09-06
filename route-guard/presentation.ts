import type { RouteGuardProgressSummary, RouteProgressRiskLevel } from './progress.ts';

export interface RouteGuardAlertPresentation {
  level: RouteProgressRiskLevel | 'amber';
  title: string;
  scoreLabel: string | null;
  distanceLabel: string | null;
  detail: string;
  action: string;
}

export function formatRouteGuardAlert(progress: RouteGuardProgressSummary | null): RouteGuardAlertPresentation {
  if (!progress) {
    return {
      level: 'low',
      title: 'Live position ready',
      scoreLabel: null,
      distanceLabel: null,
      detail: 'Start live position after scanning to compare your movement with route risk samples.',
      action: 'Start live position when you begin moving.',
    };
  }

  if (progress.status === 'off-route') {
    return {
      level: 'amber',
      title: 'Away from scanned route',
      scoreLabel: progress.nearestSample ? scoreLabel(progress.nearestSample.score, progress.nearestSample.riskLevel) : null,
      distanceLabel: formatDistance(progress.distanceToRouteMetres),
      detail: progress.message,
      action: 'Re-scan Route Guard if your journey changed.',
    };
  }

  if (progress.upcomingHotzone) {
    const hotzone = progress.upcomingHotzone;
    return {
      level: hotzone.riskLevel,
      title: `Approaching ${cleanPlaceLabel(hotzone.contextLabel)}`,
      scoreLabel: scoreLabel(hotzone.score, hotzone.riskLevel),
      distanceLabel: formatDistance(hotzone.distanceMetres),
      detail: cleanBasis(hotzone.basis) || progress.message,
      action: hotzone.riskLevel === 'red'
        ? 'Consider a safer route or stay more aware through this section.'
        : 'Use caution through this section and keep checking the route.',
    };
  }

  if (progress.nearestSample) {
    const sample = progress.nearestSample;
    return {
      level: sample.riskLevel,
      title: `Tracking ${cleanPlaceLabel(sample.contextLabel)}`,
      scoreLabel: scoreLabel(sample.score, sample.riskLevel),
      distanceLabel: formatDistance(sample.distanceMetres),
      detail: cleanBasis(sample.basis) || progress.message,
      action: 'Continue following your scanned route.',
    };
  }

  return {
    level: 'low',
    title: 'Tracking scanned route',
    scoreLabel: null,
    distanceLabel: formatDistance(progress.distanceToRouteMetres),
    detail: progress.message,
    action: 'Continue following your scanned route.',
  };
}

function scoreLabel(score: number, riskLevel: RouteProgressRiskLevel) {
  return `${Math.round(score)}/100 ${riskLevel.toUpperCase()}`;
}

function formatDistance(metres: number) {
  if (!Number.isFinite(metres)) return null;
  if (metres >= 1_000) return `${(metres / 1_000).toFixed(1)} km away`;
  return `${Math.max(1, Math.round(metres))} m away`;
}

function cleanPlaceLabel(value?: string) {
  const cleaned = String(value || '').trim()
    .replace(/^near\s+/i, '')
    .replace(/^on or near\s+/i, '')
    .replace(/\s+/g, ' ');
  return cleaned || 'this route section';
}

function cleanBasis(value?: string) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  return cleaned.endsWith('.') ? cleaned : `${cleaned}.`;
}
