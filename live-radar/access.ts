export type LiveRadarAccessPlatform = 'web' | 'native';

export interface LiveRadarAccessInput {
  platform: LiveRadarAccessPlatform;
  premium: boolean;
}

export function getLiveRadarAccess(input: LiveRadarAccessInput) {
  if (input.platform === 'web') {
    return {
      canStart: true,
      mode: 'web-session' as const,
      showUpgradeGate: false,
      requiresBackgroundPermission: false,
      requiredPermissions: ['foreground'] as const,
    };
  }

  return {
    canStart: input.premium,
    mode: 'native-background' as const,
    showUpgradeGate: !input.premium,
    requiresBackgroundPermission: true,
    requiredPermissions: ['foreground', 'background'] as const,
  };
}

export function hasRequiredLiveRadarPermissions(
  access: ReturnType<typeof getLiveRadarAccess>,
  permissions: LiveRadarPermissionSnapshot,
) {
  return permissions.foreground === 'granted'
    && (!access.requiresBackgroundPermission || permissions.background === 'granted');
}
import type { LiveRadarPermissionSnapshot } from './types.ts';
