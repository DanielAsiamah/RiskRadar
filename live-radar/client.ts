import type { PostcodeResult } from '../types.ts';
import type { LiveRiskResponse } from '../api/live-radar.ts';
import type { LiveRadarReading, LiveRadarReadingSource } from './types.ts';

export interface NormalizeLiveRadarReadingOptions {
  accuracyMetres: number | null;
  checkedAt: string;
  source: LiveRadarReadingSource;
}

export interface ScanLiveRadarCoordinatesInput {
  latitude: number;
  longitude: number;
  accuracyMetres: number;
  checkedAtIso: string;
  source: LiveRadarReadingSource;
  getNearbyPostcodeForCoordinates?: (lat: number, lng: number) => Promise<string | null>;
  fetchLiveRadarReadingForPostcode?: (postcode: string, source: LiveRadarReadingSource) => Promise<LiveRadarReading>;
}

export type ScanLiveRadarCoordinatesResult =
  | {
      ok: true;
      postcode: string;
      reading: LiveRadarReading;
    }
  | {
      ok: false;
      warning: string;
      suppressAlert: true;
    };

function toRiskLevel(value: string): LiveRadarReading['riskLevel'] {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'low') return 'low';
  if (normalized === 'moderate') return 'moderate';
  if (normalized === 'elevated' || normalized === 'amber') return 'elevated';
  return 'high';
}

export function normalizeLiveRiskToLiveRadarReading(
  result: LiveRiskResponse,
  options: NormalizeLiveRadarReadingOptions,
): LiveRadarReading {
  const contributor = result.live.contributors[0];
  return {
    checkedAt: options.checkedAt,
    postcode: result.postcode || 'Current area',
    score: result.live.liveScore,
    riskLevel: toRiskLevel(result.live.riskLevel),
    mainReason: contributor?.reason
      || `No named live incident is currently changing the ${result.historical.baselineScore}/100 historical area baseline.`,
    dataMonth: null,
    accuracyMetres: options.accuracyMetres,
    accuracyState: options.accuracyMetres !== null && options.accuracyMetres <= 100 ? 'good' : 'poor',
    source: options.source,
  };
}

function pickMainReason(result: PostcodeResult) {
  const detail = result.crimeData.riskSignals?.[0]
    || result.aiAnalysis.scoreStory[0]
    || result.aiAnalysis.summary
    || 'Local area intelligence was updated from the latest available dataset.';

  return detail.trim();
}

export function normalizePostcodeAnalysisToLiveRadarReading(
  result: PostcodeResult,
  options: NormalizeLiveRadarReadingOptions,
): LiveRadarReading {
  return {
    checkedAt: options.checkedAt,
    postcode: result.postcodeData.postcode || result.postcode,
    score: result.crimeData.crimeScore,
    riskLevel: toRiskLevel(result.crimeData.safetyLevel),
    mainReason: pickMainReason(result),
    dataMonth: result.crimeData.month || null,
    accuracyMetres: options.accuracyMetres,
    accuracyState: options.accuracyMetres !== null && options.accuracyMetres <= 100 ? 'good' : 'poor',
    source: options.source,
  };
}

export async function getNearbyPostcodeForCoordinates(lat: number, lng: number) {
  const { getNearbyPostcodesForCoordinates } = await import('../api/live-radar.ts');
  const nearby = await getNearbyPostcodesForCoordinates(lat, lng);
  return nearby[0]?.postcode?.trim().toUpperCase() || null;
}

export async function fetchLiveRadarReadingForPostcode(
  postcode: string,
  source: LiveRadarReadingSource,
): Promise<LiveRadarReading> {
  const options = { accuracyMetres: null, checkedAt: new Date().toISOString(), source };
  const { fetchLiveRiskForPostcode, fetchPostcodeAnalysis } = await import('../api/live-radar.ts');
  try {
    return normalizeLiveRiskToLiveRadarReading(await fetchLiveRiskForPostcode(postcode), options);
  } catch {
    return normalizePostcodeAnalysisToLiveRadarReading(await fetchPostcodeAnalysis(postcode), options);
  }
}

export async function scanLiveRadarCoordinates(
  input: ScanLiveRadarCoordinatesInput,
): Promise<ScanLiveRadarCoordinatesResult> {
  const resolvePostcode = input.getNearbyPostcodeForCoordinates ?? getNearbyPostcodeForCoordinates;
  const resolveReading = input.fetchLiveRadarReadingForPostcode ?? fetchLiveRadarReadingForPostcode;

  try {
    const postcode = await resolvePostcode(input.latitude, input.longitude);
    if (!postcode) {
      return {
        ok: false,
        warning: 'No nearby UK postcode could be resolved from this location.',
        suppressAlert: true,
      };
    }

    const reading = await resolveReading(postcode, input.source);
    return {
      ok: true,
      postcode,
      reading: {
        ...reading,
        checkedAt: input.checkedAtIso,
        accuracyMetres: input.accuracyMetres,
        accuracyState: input.accuracyMetres <= 100 ? 'good' : 'poor',
        source: input.source,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update Live Radar right now.';
    return {
      ok: false,
      warning: message || 'Unable to update Live Radar right now.',
      suppressAlert: true,
    };
  }
}
