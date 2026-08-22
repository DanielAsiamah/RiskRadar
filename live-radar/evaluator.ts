import type {
  EvaluateLiveRadarTransitionInput,
  EvaluateLiveRadarTransitionResult,
  LiveRadarRiskLevel,
} from './types.ts';

const COOLDOWN_MS = 25 * 60 * 1000;

const RISK_RANK: Record<LiveRadarRiskLevel, number> = {
  low: 0,
  moderate: 1,
  elevated: 2,
  high: 3,
};

export function evaluateLiveRadarTransition(
  input: EvaluateLiveRadarTransitionInput,
): EvaluateLiveRadarTransitionResult {
  const { previousReading, nextReading, settings, nowIso } = input;
  const now = Date.parse(nowIso);
  const lastAlertAt = settings.lastAlertAt ? Date.parse(settings.lastAlertAt) : null;

  if (settings.mutedPostcodes.includes(nextReading.postcode)) {
    return {
      shouldAlert: false,
      suppressedByMute: true,
    };
  }

  if (lastAlertAt && Number.isFinite(lastAlertAt) && Number.isFinite(now) && now - lastAlertAt < COOLDOWN_MS) {
    return {
      shouldAlert: false,
      suppressedByCooldown: true,
    };
  }

  if (nextReading.score >= 65) {
    return {
      shouldAlert: true,
      trigger: 'score-threshold',
      explanation: 'The local score reached 65 or above.',
    };
  }

  if (
    previousReading
    && nextReading.score > previousReading.score
    && RISK_RANK[nextReading.riskLevel] > RISK_RANK[previousReading.riskLevel]
  ) {
    return {
      shouldAlert: true,
      trigger: 'entered-higher-risk-area',
      explanation: 'You entered a higher-risk area than the previous accepted reading.',
    };
  }

  const scoreJump = previousReading ? nextReading.score - previousReading.score : 0;
  if (scoreJump >= 12 && nextReading.score >= 50) {
    return {
      shouldAlert: true,
      trigger: 'sharp-jump',
      explanation: 'The local score jumped sharply and is now at least 50.',
    };
  }

  return {
    shouldAlert: false,
  };
}
