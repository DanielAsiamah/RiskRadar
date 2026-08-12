import type { DashboardView, WatchedPlace } from './dashboard-types';
import {
  addWatchedPlace,
  getDashboard,
  listWatchedPlaces,
  removeWatchedPlace,
  renameWatchedPlace,
} from '../api/dashboard';

export const watchedPlaceFixture: WatchedPlace = {
  id: 'watch-1',
  label: 'Home',
  postcode: 'SE10 8EP',
  normalizedPostcode: 'SE10 8EP',
  lastCheckedMonth: '2026-05',
  lastSnapshot: null,
  createdAt: '2026-08-12T10:00:00.000Z',
  updatedAt: '2026-08-12T10:00:00.000Z',
};

export const watchedPlacesPromise: Promise<WatchedPlace[]> = listWatchedPlaces();
export const dashboardPromise: Promise<DashboardView> = getDashboard('watch-1');

void addWatchedPlace({ label: 'Home', postcode: 'SE10 8EP' });
void renameWatchedPlace('watch-1', 'Family');
void removeWatchedPlace('watch-1');
