import { Platform } from 'react-native';
import { deliverNativeRouteNotification, deliverRouteNotification, type RouteApproachAlert } from './alerts';

export async function requestRouteNotificationPermission(): Promise<boolean> {
  try {
    if (Platform.OS === 'web') return !!globalThis.Notification && await globalThis.Notification.requestPermission() === 'granted';
    const notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
      await notifications.setNotificationChannelAsync('route-guard', {
        name: 'Route Guard', importance: notifications.AndroidImportance.HIGH,
      });
    }
    return (await notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function sendRouteApproachNotification(alert: RouteApproachAlert): Promise<boolean> {
  if (Platform.OS === 'web') return deliverRouteNotification(alert, globalThis.Notification);
  return deliverNativeRouteNotification(alert, {
    permission: async () => (await (await import('expo-notifications')).getPermissionsAsync()).granted,
    show: async (message) => {
      const notifications = await import('expo-notifications');
      notifications.setNotificationHandler({
        handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
      });
      if (Platform.OS === 'android') {
        await notifications.setNotificationChannelAsync('route-guard', {
          name: 'Route Guard', importance: notifications.AndroidImportance.HIGH,
        });
      }
      await notifications.scheduleNotificationAsync({
        content: { title: message.title, body: message.body, data: { routeAlertKey: message.key } },
        trigger: Platform.OS === 'android' ? { channelId: 'route-guard' } : null,
      });
    },
  });
}
