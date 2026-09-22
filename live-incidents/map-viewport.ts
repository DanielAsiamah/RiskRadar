export interface LiveMapViewport {
  webZoom: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

function roundToHundredth(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildLiveMapViewport(
  center: { latitude: number; longitude: number },
  radiusMeters?: number | null,
): LiveMapViewport {
  if (!Number.isFinite(radiusMeters) || Number(radiusMeters) < 1) {
    return { webZoom: 14, latitudeDelta: 0.025, longitudeDelta: 0.025 };
  }

  const radius = Math.min(50_000, Number(radiusMeters));
  if (radius < 2_000) {
    return { webZoom: 14, latitudeDelta: 0.025, longitudeDelta: 0.025 };
  }

  const latitudeDelta = Math.max(0.025, roundToHundredth((radius * 2.5) / 111_320));
  const longitudeScale = Math.max(0.25, Math.cos(center.latitude * Math.PI / 180));
  const longitudeDelta = Math.max(0.025, roundToHundredth((radius * 2.5) / (111_320 * longitudeScale)));
  const webZoom = radius >= 8_000 ? 11 : radius >= 4_000 ? 12 : 13;
  return { webZoom, latitudeDelta, longitudeDelta };
}
