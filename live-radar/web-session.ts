export interface WebJourneyRadarSession {
  active: boolean;
  stop(): void;
}

export function createWebJourneyRadarSession(
  callback: () => void | Promise<void>,
  intervalMs = 10 * 60 * 1000,
): WebJourneyRadarSession {
  let active = true;
  const timer = setInterval(() => {
    void callback();
  }, Math.max(10_000, intervalMs));

  return {
    active,
    stop() {
      active = false;
      clearInterval(timer);
    },
  };
}
