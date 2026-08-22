import type { LiveRadarStore } from './types.ts';

export function disableLiveRadarStore(
  store: LiveRadarStore,
  warning: string | null = null,
): LiveRadarStore {
  return {
    ...store,
    settings: {
      ...store.settings,
      enabled: false,
    },
    lastWarning: warning,
  };
}

export function shouldStopLiveRadarForEntitlement(input: {
  platform: 'web' | 'native';
  store: LiveRadarStore;
  entitlementResolved: boolean;
  premium: boolean;
}) {
  return input.platform === 'native'
    && input.entitlementResolved
    && !input.premium
    && input.store.settings.enabled
    && input.store.settings.mode === 'native-background';
}

export function restoreLiveRadarStoreForPlatform(
  store: LiveRadarStore,
  platform: 'web' | 'native',
): LiveRadarStore {
  if (platform !== 'web' || !store.settings.enabled || store.settings.mode !== 'web-session') {
    return store;
  }

  return disableLiveRadarStore(
    store,
    'Journey Radar stopped when the page closed. Start it again to resume keep-open monitoring.',
  );
}
