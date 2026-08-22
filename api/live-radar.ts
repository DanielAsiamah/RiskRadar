import type { PostcodeResult } from '../types.ts';
import { apiRequest } from './client';

interface LocationSuggestionsResponse {
  nearby?: Array<{
    postcode: string;
    admin_district: string;
  }>;
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
