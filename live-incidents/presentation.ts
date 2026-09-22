import type {
  LiveIncidentCard,
  LiveIncidentCategory,
  LiveIncidentListResponse,
  LiveIncidentMapMarker,
  LiveIncidentMapModel,
  LiveIncidentSourceState,
  LiveIncidentVerification,
} from './types.ts';

const SEVERITY_COLORS = {
  1: { color: '#059669', softColor: '#d1fae5' },
  2: { color: '#2563eb', softColor: '#dbeafe' },
  3: { color: '#d97706', softColor: '#fef3c7' },
  4: { color: '#dc2626', softColor: '#fee2e2' },
  5: { color: '#be123c', softColor: '#ffe4e6' },
} as const;

const CATEGORY_LABELS: Record<LiveIncidentCategory, string> = {
  flood: 'Flood warning',
  'road-collision': 'Road collision',
  'road-closure': 'Road closure',
  'transport-disruption': 'Transport disruption',
  fire: 'Fire',
  'hazardous-material': 'Hazardous material',
  'severe-weather': 'Severe weather',
  'police-activity': 'Police activity',
  'violent-incident': 'Violent incident',
  'public-safety': 'Public safety incident',
  other: 'Live incident',
};

const PROVIDER_LABELS: Record<string, string> = {
  'environment-agency': 'Environment Agency',
  'transport-for-london': 'Transport for London',
  'national-highways': 'National Highways',
};

const PRECISION_LABELS: Record<string, string> = {
  'exact-area': 'Official affected area',
  'road-segment': 'Approximate road segment',
  'postcode-sector': 'Approximate postcode sector',
  district: 'Approximate district',
  unknown: 'Approximate location',
};

function validNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validPoint(value: unknown): value is { latitude: number; longitude: number } {
  if (!value || typeof value !== 'object') return false;
  const point = value as { latitude?: unknown; longitude?: unknown };
  return validNumber(point.latitude) && validNumber(point.longitude)
    && point.latitude >= -90 && point.latitude <= 90
    && point.longitude >= -180 && point.longitude <= 180;
}

function httpsSourceUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function validTimestamp(value: unknown) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function relativeTime(value: string | null, generatedAt: string | null) {
  if (!value || !generatedAt) return 'Update time unavailable';
  const differenceMinutes = Math.max(0, Math.round((Date.parse(generatedAt) - Date.parse(value)) / 60_000));
  if (differenceMinutes < 1) return 'Updated just now';
  if (differenceMinutes === 1) return 'Updated 1 minute ago';
  if (differenceMinutes < 60) return `Updated ${differenceMinutes} minutes ago`;
  const hours = Math.round(differenceMinutes / 60);
  return `Updated ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
}

function providerLabel(provider: unknown) {
  if (typeof provider !== 'string' || !provider.trim()) return 'Named official source';
  return PROVIDER_LABELS[provider] ?? provider.split('-').map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' ');
}

function toMarker(value: unknown): LiveIncidentMapMarker | null {
  if (!value || typeof value !== 'object') return null;
  const incident = value as Record<string, unknown>;
  if (!validPoint(incident.centroid)) return null;
  const severity = incident.severity;
  if (typeof severity !== 'number' || !Number.isInteger(severity) || severity < 1 || severity > 5) return null;
  const category = Object.hasOwn(CATEGORY_LABELS, String(incident.category))
    ? incident.category as LiveIncidentCategory
    : 'other';
  const verification = ['Official', 'Corroborated', 'Preliminary', 'Unverified'].includes(String(incident.verificationLevel))
    ? incident.verificationLevel as LiveIncidentVerification
    : 'Unverified';
  const affectedRadiusMetres = validNumber(incident.affectedRadiusMetres)
    ? Math.min(100_000, Math.max(1, incident.affectedRadiusMetres))
    : 250;
  const palette = SEVERITY_COLORS[severity as keyof typeof SEVERITY_COLORS];

  return {
    id: String(incident.id || ''),
    latitude: incident.centroid.latitude,
    longitude: incident.centroid.longitude,
    title: String(incident.title || CATEGORY_LABELS[category]),
    summary: String(incident.summary || 'No further source detail is available.'),
    category,
    categoryLabel: CATEGORY_LABELS[category],
    severity: severity as LiveIncidentMapMarker['severity'],
    ...palette,
    affectedRadiusMetres,
    providerLabel: providerLabel(incident.provider),
    verificationLabel: verification,
    locationLabel: String(incident.locationLabel || 'Approximate affected area'),
    locationPrecisionLabel: PRECISION_LABELS[String(incident.locationPrecision)] ?? PRECISION_LABELS.unknown,
    sourceUpdatedAt: validTimestamp(incident.sourceUpdatedAt) ?? validTimestamp(incident.updatedAt),
    sourceUrl: httpsSourceUrl(incident.sourceUrl),
  };
}

function limitedDetail(sources: LiveIncidentSourceState[]) {
  const unavailable = sources.find((source) => ['stale', 'failed', 'disabled', 'not-configured'].includes(source.state));
  return typeof unavailable?.disclosure === 'string' && unavailable.disclosure.trim()
    ? unavailable.disclosure.trim()
    : 'No connected live source has reported successfully. Try again shortly.';
}

export function buildLiveIncidentMapModel(value: LiveIncidentListResponse | unknown): LiveIncidentMapModel {
  const response = value && typeof value === 'object' ? value as Partial<LiveIncidentListResponse> : {};
  const generatedAt = validTimestamp(response.generatedAt);
  const sources = Array.isArray(response.sources) ? response.sources : [];
  const markers = (Array.isArray(response.incidents) ? response.incidents : [])
    .map(toMarker)
    .filter((marker): marker is LiveIncidentMapMarker => marker !== null)
    .sort((left, right) => right.severity - left.severity
      || Date.parse(right.sourceUpdatedAt ?? '') - Date.parse(left.sourceUpdatedAt ?? ''));
  const cards: LiveIncidentCard[] = markers.map((marker) => ({
    ...marker,
    updatedAtLabel: relativeTime(marker.sourceUpdatedAt, generatedAt),
  }));
  const liveSourcesAvailable = sources.some((source) => source?.state === 'healthy');

  let summary: LiveIncidentMapModel['summary'];
  if (!liveSourcesAvailable) {
    summary = { tone: 'limited', title: 'Live incident coverage is limited', detail: limitedDetail(sources) };
  } else if (markers.length === 0) {
    summary = {
      tone: 'clear',
      title: 'No current official incidents found nearby',
      detail: 'Connected sources reported no active incidents inside this 10 km view. Coverage is limited to the sources listed below.',
    };
  } else {
    const highestSeverity = markers[0].severity;
    const allOfficial = markers.every((marker) => marker.verificationLabel === 'Official');
    summary = {
      tone: highestSeverity >= 4 ? 'danger' : highestSeverity === 3 ? 'caution' : 'info',
      title: `${markers.length} current ${allOfficial ? 'official ' : ''}${markers.length === 1 ? 'incident' : 'incidents'} nearby`,
      detail: 'Markers show current named-source incidents, not monthly Police.uk records. Select an incident for source and update details.',
    };
  }

  return {
    markers,
    cards,
    summary,
    generatedAt,
    disclaimer: typeof response.disclaimer === 'string' ? response.disclaimer : 'RiskRadar provides current area intelligence, not guaranteed safety.',
    sources,
  };
}
