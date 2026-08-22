export interface LiveRadarCurrentPosition {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
  };
}

export type LiveRadarLocationResult =
  | {
      ok: true;
      location: {
        latitude: number;
        longitude: number;
        accuracyMetres: number;
      };
    }
  | {
      ok: false;
      warning: string;
    };

export async function readCurrentLiveRadarLocation(
  getCurrentPosition: () => Promise<LiveRadarCurrentPosition>,
): Promise<LiveRadarLocationResult> {
  try {
    const result = await getCurrentPosition();
    if (!Number.isFinite(result.coords.latitude) || !Number.isFinite(result.coords.longitude)) {
      return {
        ok: false,
        warning: 'Live Radar did not receive a usable current location.',
      };
    }

    return {
      ok: true,
      location: {
        latitude: result.coords.latitude,
        longitude: result.coords.longitude,
        accuracyMetres: Number.isFinite(result.coords.accuracy) ? Number(result.coords.accuracy) : 999,
      },
    };
  } catch {
    return {
      ok: false,
      warning: 'Live Radar could not read your current location. Check location permission and GPS, then try again.',
    };
  }
}
