import type { JourneyLocation } from './location-session.ts';

export function watchBrowserJourneyPosition(
  geolocation: Pick<Geolocation, 'watchPosition' | 'clearWatch'>,
  onLocation: (location: JourneyLocation) => void,
  onError: (error: Error) => void,
  onWarning: (warning: Error) => void,
) {
  const id = geolocation.watchPosition(
    (position) => onLocation({
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracyMetres: position.coords.accuracy, timestamp: position.timestamp,
    }),
    (error) => {
      // A browser watch continues after transient failures. Only denied access is terminal.
      if (error.code === 2 || error.code === 3) {
        onWarning(new Error('Location temporarily unavailable. Waiting for a fresh fix; approach alerts are paused.'));
      } else {
        onError(new Error(error.code === 1 ? 'Location permission was denied. Enable access to resume tracking.' : 'Location access failed.'));
      }
    },
    { enableHighAccuracy: true, maximumAge: 10_000, timeout: 15_000 },
  );
  return { remove: () => geolocation.clearWatch(id) };
}
