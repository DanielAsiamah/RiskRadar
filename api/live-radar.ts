import type { PostcodeResult } from '../types.ts';
import type { LiveIncidentListResponse } from '../live-incidents/types.ts';
import { apiRequest } from './client';

interface LocationSuggestionsResponse {
  nearby?: Array<{
    postcode: string;
    admin_district: string;
  }>;
}

export interface LiveRiskResponse {
  postcode?: string;
  historical: { baselineScore: number };
  context: { contextScore: number; adjustments: Array<{ id: string; label: string; points: number }> };
  live: {
    liveScore: number;
    riskLevel: 'low' | 'amber' | 'high';
    contributors: Array<{ category: string; reason: string }>;
  };
}

export interface LiveSourceStatusResponse {
  generatedAt: string;
  network: {
    status: string;
    durability: string;
    persistent: boolean;
    disclosure: string;
  };
  sources: Array<{
    sourceId?: string;
    id?: string;
    state: string;
    [key: string]: unknown;
  }>;
  disclaimer: string;
}

export async function getNearbyPostcodesForCoordinates(lat: number, lng: number) {
  const response = await apiRequest<LocationSuggestionsResponse>(
    `/api/location-suggestions?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`,
    {},
    20_000,
  );

  return Array.isArray(response.nearby) ? response.nearby : [];
}

export function fetchPostcodeAnalysis(postcode: string) {
  return apiRequest<PostcodeResult>(
    '/api/analyze-postcode',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcode }),
    },
    40_000,
  );
}

export function fetchLiveRiskForPostcode(postcode: string) {
  return apiRequest<LiveRiskResponse>(
    '/api/live-risk',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postcode }),
    },
    40_000,
  );
}

export function fetchLiveSourceStatus() {
  return apiRequest<LiveSourceStatusResponse>('/api/live-source-status', {}, 8_000);
}

export function fetchLiveIncidentsNear(
  point: { latitude: number; longitude: number },
  options: { radiusKm?: number; limit?: number; signal?: AbortSignal } = {},
) {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90
    || !Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    return Promise.reject(new TypeError('A valid latitude and longitude are required for live incidents.'));
  }
  const radiusKm = Math.min(10, Math.max(0.1, Number.isFinite(options.radiusKm) ? Number(options.radiusKm) : 10));
  const limit = Math.min(100, Math.max(1, Number.isInteger(options.limit) ? Number(options.limit) : 50));
  const query = new URLSearchParams({
    lat: String(point.latitude),
    lng: String(point.longitude),
    radiusKm: String(radiusKm),
    limit: String(limit),
  });
  return apiRequest<LiveIncidentListResponse>(`/api/live-incidents?${query.toString()}`, { signal: options.signal }, 12_000);
}
