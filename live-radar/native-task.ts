import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';

export const LIVE_RADAR_TASK_NAME = 'riskradar-live-radar-location';

export interface LiveRadarTaskPayload {
  locations?: Array<{
    coords?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number | null;
    };
    timestamp?: number;
  }>;
}

export type LiveRadarTaskHandler = (input: { data: LiveRadarTaskPayload | null; error: Error | null }) => Promise<void> | void;

let liveRadarTaskHandler: LiveRadarTaskHandler | null = null;

if (!TaskManager.isTaskDefined(LIVE_RADAR_TASK_NAME)) {
  TaskManager.defineTask(LIVE_RADAR_TASK_NAME, async ({ data, error }) => {
    if (!liveRadarTaskHandler) return;
    await liveRadarTaskHandler({
      data: (data as LiveRadarTaskPayload | null) ?? null,
      error: (error as Error | null) ?? null,
    });
  });
}

export function setLiveRadarTaskHandler(handler: LiveRadarTaskHandler | null) {
  liveRadarTaskHandler = handler;
}

export async function ensureNativeLiveRadarTaskRegistered() {
  const available = await TaskManager.isAvailableAsync();
  const registered = available
    ? await TaskManager.isTaskRegisteredAsync(LIVE_RADAR_TASK_NAME)
    : false;

  return {
    available,
    registered,
  };
}

export async function startNativeLiveRadarTask() {
  return Location.startLocationUpdatesAsync(LIVE_RADAR_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 250,
    deferredUpdatesDistance: 250,
    deferredUpdatesInterval: 10 * 60 * 1000,
    timeInterval: 10 * 60 * 1000,
  });
}

export async function stopNativeLiveRadarTask() {
  const registered = await TaskManager.isTaskRegisteredAsync(LIVE_RADAR_TASK_NAME);
  if (registered) {
    await Location.stopLocationUpdatesAsync(LIVE_RADAR_TASK_NAME);
  }
}
