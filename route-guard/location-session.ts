export interface JourneyLocation {
  latitude: number;
  longitude: number;
  accuracyMetres: number | null;
  timestamp: number;
}

export function startJourneyLocationSession(input: {
  subscribe(onLocation: (location: JourneyLocation) => void, onError: (error: Error) => void): Promise<{ remove(): void }>;
  onLocation(location: JourneyLocation): void;
  onError(error: Error): void;
}) {
  let active = true;
  let subscription: { remove(): void } | undefined;
  const stop = () => {
    active = false;
    subscription?.remove();
    subscription = undefined;
  };
  const fail = (error: Error) => {
    if (!active) return;
    stop();
    input.onError(error);
  };
  void (async () => {
    try {
      const created = await input.subscribe((location) => {
        if (active) input.onLocation(location);
      }, fail);
      if (active) subscription = created;
      else created.remove();
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Location tracking is unavailable.'));
    }
  })();
  return stop;
}
