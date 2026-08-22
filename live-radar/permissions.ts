import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import type { LiveRadarPermissionSnapshot, LiveRadarPermissionState } from './types.ts';
import { runPermissionRequest } from './permission-request.ts';

function toPermissionState(status: string | undefined): LiveRadarPermissionState {
  if (status === 'granted') return 'granted';
  if (status === 'denied') return 'denied';
  return 'unknown';
}

async function readNotificationPermissionState(): Promise<LiveRadarPermissionState> {
  if (Platform.OS === 'web') return 'unsupported';

  try {
    const settings = await Notifications.getPermissionsAsync();
    return toPermissionState(settings.status);
  } catch {
    return 'unsupported';
  }
}

export async function readLiveRadarPermissions(): Promise<LiveRadarPermissionSnapshot> {
  const [foreground, background, notifications] = await Promise.all([
    Location.getForegroundPermissionsAsync().then((permission) => toPermissionState(permission.status)).catch(() => 'unknown' as const),
    Location.getBackgroundPermissionsAsync().then((permission) => toPermissionState(permission.status)).catch(() => 'unknown' as const),
    readNotificationPermissionState(),
  ]);

  return { foreground, background, notifications };
}

export async function requestForegroundPermission(): Promise<LiveRadarPermissionSnapshot> {
  return runPermissionRequest(
    () => Location.requestForegroundPermissionsAsync(),
    readLiveRadarPermissions,
  );
}

export async function requestBackgroundPermission(): Promise<LiveRadarPermissionSnapshot> {
  return runPermissionRequest(
    () => Location.requestBackgroundPermissionsAsync(),
    readLiveRadarPermissions,
  );
}

export async function requestNotificationPermission(): Promise<LiveRadarPermissionSnapshot> {
  if (Platform.OS === 'web') return readLiveRadarPermissions();
  return runPermissionRequest(
    () => Notifications.requestPermissionsAsync(),
    readLiveRadarPermissions,
  );
}
