import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  defaultLiveRadarBackgroundDependencies,
  processLiveRadarBackgroundUpdate,
  type LiveRadarBackgroundInput,
} from './background-processor.ts';
import {
  LIVE_RADAR_STORAGE_KEY,
  parseLiveRadarStore,
  serializeLiveRadarStore,
} from './storage.ts';
import { runLiveRadarExclusive } from './operation-lock.ts';

export function processHeadlessLiveRadarTask(input: LiveRadarBackgroundInput) {
  return runLiveRadarExclusive(() => processLiveRadarBackgroundUpdate(input, {
    ...defaultLiveRadarBackgroundDependencies,
    loadStore: async () => parseLiveRadarStore(await AsyncStorage.getItem(LIVE_RADAR_STORAGE_KEY)),
    saveStore: async (store) => {
      await AsyncStorage.setItem(LIVE_RADAR_STORAGE_KEY, serializeLiveRadarStore(store));
    },
    nowIso: () => new Date().toISOString(),
    createAlertId: () => `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }));
}
