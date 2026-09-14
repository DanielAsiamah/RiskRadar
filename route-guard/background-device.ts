import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { processRouteBackgroundUpdate } from './background';
import { createRouteBackgroundState, parseRouteBackgroundState, ROUTE_BACKGROUND_STORAGE_KEY } from './background-storage';
import { refreshRouteGuardRisk, type RouteGuardScan } from '../api/route-guard';
import { sendRouteApproachNotification } from './notification-device';

const TASK = 'riskradar-route-background-v1';
let epoch = 0;
let tail: Promise<unknown> = Promise.resolve();
let refreshAbort: AbortController | null = null;
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work, work);
  tail = result.catch(() => undefined);
  return result;
}
async function load() {
  return parseRouteBackgroundState(await AsyncStorage.getItem(ROUTE_BACKGROUND_STORAGE_KEY));
}
async function stopOsTask() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK)) await Location.stopLocationUpdatesAsync(TASK);
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask(TASK, ({ data, error }) => exclusive(async () => {
    const token = epoch;
    const stored = await load();
    if (!stored?.enabled || stored.expiresAt <= Date.now()) {
      await AsyncStorage.removeItem(ROUTE_BACKGROUND_STORAGE_KEY);
      await stopOsTask();
      return;
    }
    if (error) {
      await AsyncStorage.setItem(ROUTE_BACKGROUND_STORAGE_KEY, JSON.stringify({ ...stored, warning: error.message }));
      return;
    }
    const payload = data as { locations?: Location.LocationObject[] } | undefined;
    const fixes = (payload?.locations ?? []).map((fix) => ({
      latitude: fix.coords.latitude, longitude: fix.coords.longitude,
      accuracyMetres: fix.coords.accuracy, timestamp: fix.timestamp,
    }));
    refreshAbort = new AbortController();
    try {
      await processRouteBackgroundUpdate(fixes, {
        load: async () => token === epoch ? load() : null,
        save: async (state) => { if (token === epoch) await AsyncStorage.setItem(ROUTE_BACKGROUND_STORAGE_KEY, JSON.stringify(state)); },
        refresh: (route) => refreshRouteGuardRisk(route.sampledRiskScores, refreshAbort!.signal),
        notify: (alert) => token === epoch ? sendRouteApproachNotification(alert) : Promise.resolve(false),
        now: Date.now,
      });
    } finally { refreshAbort = null; }
  }));
}

export async function readBackgroundRoute() {
  if (Platform.OS === 'web') return null;
  return exclusive(async () => {
    const state = await load();
    if (state?.enabled && !await Location.hasStartedLocationUpdatesAsync(TASK)) {
      const stopped = { ...state, enabled: false, warning: 'The device is not monitoring this route. Start background monitoring again.' };
      await AsyncStorage.setItem(ROUTE_BACKGROUND_STORAGE_KEY, JSON.stringify(stopped));
      return stopped;
    }
    return state;
  });
}

export async function startBackgroundRoute(route: RouteGuardScan) {
  if (Platform.OS === 'web') throw new Error('Background routes require the native app.');
  const token = ++epoch;
  refreshAbort?.abort();
  if (!await TaskManager.isAvailableAsync()) throw new Error('Use a development or installed build for background routes.');
  if (!(await Location.requestForegroundPermissionsAsync()).granted) throw new Error('Foreground location permission is required.');
  if (!(await Location.requestBackgroundPermissionsAsync()).granted) throw new Error('Allow background location in device settings.');
  if (token !== epoch) throw new Error('Background start was cancelled.');
  return exclusive(async () => {
    if (token !== epoch) throw new Error('Background start was cancelled.');
    const state = createRouteBackgroundState(route, `route-${Date.now()}-${Math.random().toString(36).slice(2)}`, Date.now());
    await AsyncStorage.setItem(ROUTE_BACKGROUND_STORAGE_KEY, JSON.stringify(state));
    try {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.High, distanceInterval: 25, timeInterval: 10_000,
        pausesUpdatesAutomatically: false, showsBackgroundLocationIndicator: true,
        foregroundService: { notificationTitle: 'RiskRadar Route Guard', notificationBody: 'Monitoring your route for approaching risk areas.' },
      });
      return state;
    } catch (error) {
      await AsyncStorage.removeItem(ROUTE_BACKGROUND_STORAGE_KEY);
      throw error;
    }
  });
}

export function stopBackgroundRoute() {
  epoch += 1;
  refreshAbort?.abort();
  if (Platform.OS === 'web') return Promise.resolve();
  return exclusive(async () => {
    await AsyncStorage.removeItem(ROUTE_BACKGROUND_STORAGE_KEY);
    await stopOsTask();
  });
}
