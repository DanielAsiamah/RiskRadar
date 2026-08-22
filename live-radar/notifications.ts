import type { LiveRadarAlertEvent } from './types.ts';

export function buildLocalNotificationMessage(input: Pick<LiveRadarAlertEvent, 'postcode' | 'score' | 'trigger' | 'explanation'>) {
  const triggerLabel = input.trigger === 'entered-higher-risk-area'
    ? 'entered a higher-risk area'
    : input.trigger === 'sharp-jump'
      ? 'score jumped sharply'
      : 'score reached the alert threshold';

  return {
    title: 'RiskRadar Live Radar',
    body: `${input.postcode} is now ${input.score}/100 because the local ${triggerLabel}. ${input.explanation}`,
  };
}

async function ensureNotificationChannelAsync() {
  const { Platform } = await import('react-native');
  if (Platform.OS !== 'android') return;

  const Notifications = await import('expo-notifications');
  await Notifications.setNotificationChannelAsync('live-radar-alerts', {
    name: 'Live Radar Alerts',
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export async function scheduleLocalRiskNotification(input: Pick<LiveRadarAlertEvent, 'postcode' | 'score' | 'trigger' | 'explanation'>) {
  const { Platform } = await import('react-native');
  if (Platform.OS === 'web') {
    return { delivered: false, reason: 'unsupported' as const };
  }

  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    await ensureNotificationChannelAsync();
    const message = buildLocalNotificationMessage(input);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: message.title,
        body: message.body,
      },
      trigger: null,
    });
    return { delivered: true as const };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'notification-unavailable';
    return { delivered: false as const, reason };
  }
}
