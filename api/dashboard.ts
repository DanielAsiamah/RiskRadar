import type { DashboardView, WatchedPlace } from '../membership/dashboard-types';
import { apiRequest } from './client';

interface WatchedPlacesResponse {
  watchedPlaces: WatchedPlace[];
}

interface WatchedPlaceResponse {
  watchedPlace: WatchedPlace;
}

interface DeleteWatchedPlaceResponse {
  ok: boolean;
  deletedId: string;
}

export function listWatchedPlaces(): Promise<WatchedPlace[]> {
  return apiRequest<WatchedPlacesResponse>('/api/watchlist', {}, 40_000, 'required')
    .then((response) => response.watchedPlaces);
}

export function addWatchedPlace(input: { label: string; postcode: string }): Promise<WatchedPlace> {
  return apiRequest<WatchedPlaceResponse>('/api/watchlist', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  }, 40_000, 'required').then((response) => response.watchedPlace);
}

export function renameWatchedPlace(id: string, label: string): Promise<WatchedPlace> {
  return apiRequest<WatchedPlaceResponse>(`/api/watchlist/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ label }),
  }, 40_000, 'required').then((response) => response.watchedPlace);
}

export function removeWatchedPlace(id: string): Promise<DeleteWatchedPlaceResponse> {
  return apiRequest<DeleteWatchedPlaceResponse>(`/api/watchlist/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  }, 40_000, 'required');
}

export function getDashboard(watchId?: string): Promise<DashboardView> {
  const query = watchId ? `?watchId=${encodeURIComponent(watchId)}` : '';
  return apiRequest<DashboardView>(`/api/dashboard${query}`, {}, 40_000, 'required');
}
