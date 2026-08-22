import type {
  LiveRadarAlertEvent,
  LiveRadarPermissionSnapshot,
  LiveRadarSettings,
  LiveRadarStore,
} from './types.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeSettings(value: unknown): LiveRadarSettings | null {
  if (!isObject(value)) return null;

  const {
    enabled,
    mode,
    alertsReduced,
    mutedPostcodes,
    lastAlertAt,
    onboardingCompleted,
  } = value;

  if (typeof enabled !== 'boolean') return null;
  if (mode !== 'native-background' && mode !== 'web-session') return null;
  if (typeof alertsReduced !== 'boolean') return null;
  if (!Array.isArray(mutedPostcodes) || mutedPostcodes.some((postcode) => typeof postcode !== 'string')) return null;
  if (!(typeof lastAlertAt === 'string' || lastAlertAt === null)) return null;
  if (typeof onboardingCompleted !== 'boolean') return null;

  return {
    enabled,
    mode,
    alertsReduced,
    mutedPostcodes: [...mutedPostcodes],
    lastAlertAt,
    onboardingCompleted,
  };
}

function normalizePermissions(value: unknown): LiveRadarPermissionSnapshot | null {
  if (!isObject(value)) return null;
  const valid = new Set(['unknown', 'granted', 'denied', 'unsupported']);
  if (!valid.has(String(value.foreground)) || !valid.has(String(value.background)) || !valid.has(String(value.notifications))) {
    return null;
  }

  return {
    foreground: String(value.foreground) as LiveRadarPermissionSnapshot['foreground'],
    background: String(value.background) as LiveRadarPermissionSnapshot['background'],
    notifications: String(value.notifications) as LiveRadarPermissionSnapshot['notifications'],
  };
}

function normalizeEvent(value: unknown): LiveRadarAlertEvent | null {
  if (!isObject(value)) return null;

  const validLevels = new Set(['low', 'moderate', 'elevated', 'high']);
  const validTriggers = new Set(['entered-higher-risk-area', 'score-threshold', 'sharp-jump']);

  if (typeof value.id !== 'string') return null;
  if (typeof value.createdAt !== 'string') return null;
  if (typeof value.postcode !== 'string') return null;
  if (typeof value.score !== 'number' || !Number.isFinite(value.score)) return null;
  if (!validLevels.has(String(value.riskLevel))) return null;
  if (!validTriggers.has(String(value.trigger))) return null;
  if (typeof value.explanation !== 'string') return null;
  if (typeof value.notificationSent !== 'boolean') return null;

  return {
    id: value.id,
    createdAt: value.createdAt,
    postcode: value.postcode,
    score: value.score,
    riskLevel: value.riskLevel as LiveRadarAlertEvent['riskLevel'],
    trigger: value.trigger as LiveRadarAlertEvent['trigger'],
    explanation: value.explanation,
    notificationSent: value.notificationSent,
  };
}

export function createDefaultLiveRadarStore(): LiveRadarStore {
  return {
    settings: {
      enabled: false,
      mode: 'native-background',
      alertsReduced: false,
      mutedPostcodes: [],
      lastAlertAt: null,
      onboardingCompleted: false,
    },
    history: [],
    currentReading: null,
    permissions: {
      foreground: 'unknown',
      background: 'unknown',
      notifications: 'unknown',
    },
    lastWarning: null,
  };
}

export function parseLiveRadarStore(raw: string | null): LiveRadarStore {
  if (!raw) return createDefaultLiveRadarStore();

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isObject(parsed)) return createDefaultLiveRadarStore();

    const settings = normalizeSettings(parsed.settings);
    const permissions = normalizePermissions(parsed.permissions);
    const historyRaw = parsed.history;
    const currentReading = parsed.currentReading ?? null;
    const lastWarning = parsed.lastWarning ?? null;

    if (!settings || !permissions) return createDefaultLiveRadarStore();
    if (!Array.isArray(historyRaw)) return createDefaultLiveRadarStore();
    if (!(lastWarning === null || typeof lastWarning === 'string')) return createDefaultLiveRadarStore();
    if (!(currentReading === null || isObject(currentReading))) return createDefaultLiveRadarStore();

    const history = historyRaw.map(normalizeEvent);
    if (history.some((event) => event === null)) return createDefaultLiveRadarStore();

    return {
      settings,
      history: history as LiveRadarAlertEvent[],
      currentReading: currentReading as LiveRadarStore['currentReading'],
      permissions,
      lastWarning,
    };
  } catch {
    return createDefaultLiveRadarStore();
  }
}

export function serializeLiveRadarStore(store: LiveRadarStore): string {
  return JSON.stringify(store);
}

export function appendAlertHistory(
  store: LiveRadarStore,
  event: LiveRadarAlertEvent,
  maxEntries = 50,
): LiveRadarStore {
  const boundedMax = Math.max(1, Math.floor(maxEntries));
  const history = [event, ...store.history]
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, boundedMax);

  return {
    ...store,
    history,
  };
}
