import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { startJourneyLocationSession, type JourneyLocation } from './location-session';
import { watchBrowserJourneyPosition } from './browser-location';

function normalize(position: { coords: { latitude: number; longitude: number; accuracy: number | null }; timestamp: number }): JourneyLocation {
  return {
    latitude: position.coords.latitude, longitude: position.coords.longitude,
    accuracyMetres: position.coords.accuracy, timestamp: position.timestamp,
  };
}

function browserLocation() {
  const geolocation = globalThis.navigator?.geolocation;
  if (!geolocation) throw new Error('Location is unavailable. Use HTTPS and enable location access.');
  return geolocation;
}

async function requireNativePermission() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== 'granted') throw new Error('Allow location access in device settings to track your journey.');
  if (!await Location.hasServicesEnabledAsync()) throw new Error('Turn on device location services to track your journey.');
}

export async function readJourneyLocation(): Promise<JourneyLocation> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => browserLocation().getCurrentPosition(
      (position) => resolve(normalize(position)),
      (error) => reject(new Error(error.message || 'Location access failed.')),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
    ));
  }
  await requireNativePermission();
  return normalize(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }));
}

export function watchJourneyLocation(onLocation: (location: JourneyLocation) => void, onError: (error: Error) => void, onWarning?: (warning: Error) => void) {
  return startJourneyLocationSession({
    onLocation, onError, onWarning,
    subscribe: async (update, fail, warn) => {
      if (Platform.OS === 'web') {
        return watchBrowserJourneyPosition(browserLocation(), update, fail, warn);
      }
      await requireNativePermission();
      return Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
        (position) => update(normalize(position)),
        (reason) => fail(new Error(reason)),
      );
    },
  });
}
