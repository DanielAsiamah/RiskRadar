import { scanLiveRadarCoordinates } from './client.ts';
import { evaluateLiveRadarTransition } from './evaluator.ts';
import { scheduleLocalRiskNotification } from './notifications.ts';
import { appendAlertHistory } from './storage.ts';
import type { LiveRadarAlertEvent, LiveRadarStore } from './types.ts';

export interface LiveRadarBackgroundPayload {
  locations?: Array<{
    coords?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number | null;
    };
    timestamp?: number;
  }>;
}

type ScanCoordinates = typeof scanLiveRadarCoordinates;
type NotificationInput = Pick<LiveRadarAlertEvent, 'postcode' | 'score' | 'trigger' | 'explanation'>;

export interface LiveRadarBackgroundDependencies {
  loadStore(): Promise<LiveRadarStore>;
  saveStore(store: LiveRadarStore): Promise<void>;
  scanCoordinates: ScanCoordinates;
  sendNotification(input: NotificationInput): Promise<{ delivered: boolean; reason?: string }>;
  nowIso(): string;
  createAlertId(): string;
}

export interface LiveRadarBackgroundInput {
  data: LiveRadarBackgroundPayload | null;
  error: Error | null;
}

export type LiveRadarBackgroundResult =
  | { status: 'ignored' }
  | { status: 'warning'; store: LiveRadarStore }
  | { status: 'updated' | 'alerted'; store: LiveRadarStore };

function latestUsableLocation(payload: LiveRadarBackgroundPayload | null) {
  const locations = payload?.locations ?? [];
  for (let index = locations.length - 1; index >= 0; index -= 1) {
    const coords = locations[index]?.coords;
    if (Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude)) {
      return {
        latitude: Number(coords?.latitude),
        longitude: Number(coords?.longitude),
        accuracyMetres: Number.isFinite(coords?.accuracy) ? Number(coords?.accuracy) : 999,
      };
    }
  }
  return null;
}

async function saveWarning(
  store: LiveRadarStore,
  warning: string,
  saveStore: LiveRadarBackgroundDependencies['saveStore'],
): Promise<LiveRadarBackgroundResult> {
  const nextStore = { ...store, lastWarning: warning };
  await saveStore(nextStore);
  return { status: 'warning', store: nextStore };
}

export async function processLiveRadarBackgroundUpdate(
  input: LiveRadarBackgroundInput,
  dependencies: LiveRadarBackgroundDependencies,
): Promise<LiveRadarBackgroundResult> {
  const store = await dependencies.loadStore();
  if (!store.settings.enabled) return { status: 'ignored' };

  if (input.error) {
    return saveWarning(
      store,
      input.error.message || 'Live Radar could not process a background update.',
      dependencies.saveStore,
    );
  }

  const location = latestUsableLocation(input.data);
  if (!location) {
    return saveWarning(
      store,
      'Live Radar did not receive a usable background location.',
      dependencies.saveStore,
    );
  }

  if (location.accuracyMetres > 250) {
    return saveWarning(
      store,
      'Background location accuracy was too low, so this reading was skipped.',
      dependencies.saveStore,
    );
  }

  const checkedAtIso = dependencies.nowIso();
  const scanResult = await dependencies.scanCoordinates({
    ...location,
    checkedAtIso,
    source: 'background',
  });

  if (!scanResult.ok) {
    return saveWarning(store, scanResult.warning, dependencies.saveStore);
  }

  const evaluation = evaluateLiveRadarTransition({
    previousReading: store.currentReading,
    nextReading: scanResult.reading,
    settings: store.settings,
    nowIso: checkedAtIso,
  });
  const suppressForReducedAlerts = store.settings.alertsReduced && evaluation.trigger === 'sharp-jump';
  let nextStore: LiveRadarStore = {
    ...store,
    currentReading: scanResult.reading,
    lastWarning: location.accuracyMetres > 100
      ? 'Location accuracy was low, so this result may be less precise.'
      : null,
  };

  if (evaluation.shouldAlert && evaluation.trigger && evaluation.explanation && !suppressForReducedAlerts) {
    const notification = await dependencies.sendNotification({
      postcode: scanResult.reading.postcode,
      score: scanResult.reading.score,
      trigger: evaluation.trigger,
      explanation: evaluation.explanation,
    });
    if (!notification.delivered) {
      nextStore = {
        ...nextStore,
        lastWarning: 'Alert saved locally, but a device banner could not be shown. Review notification permission.',
      };
    }
    nextStore = appendAlertHistory(nextStore, {
      id: dependencies.createAlertId(),
      createdAt: checkedAtIso,
      postcode: scanResult.reading.postcode,
      score: scanResult.reading.score,
      riskLevel: scanResult.reading.riskLevel,
      trigger: evaluation.trigger,
      explanation: evaluation.explanation,
      notificationSent: notification.delivered,
    });
    nextStore = {
      ...nextStore,
      settings: {
        ...nextStore.settings,
        lastAlertAt: checkedAtIso,
      },
    };
  }

  await dependencies.saveStore(nextStore);
  return {
    status: evaluation.shouldAlert && !suppressForReducedAlerts ? 'alerted' : 'updated',
    store: nextStore,
  };
}

export const defaultLiveRadarBackgroundDependencies = {
  scanCoordinates: scanLiveRadarCoordinates,
  sendNotification: scheduleLocalRiskNotification,
};
