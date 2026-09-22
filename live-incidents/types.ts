export type LiveIncidentCategory =
  | 'flood'
  | 'road-collision'
  | 'road-closure'
  | 'transport-disruption'
  | 'fire'
  | 'hazardous-material'
  | 'severe-weather'
  | 'police-activity'
  | 'violent-incident'
  | 'public-safety'
  | 'other';

export type LiveIncidentVerification = 'Official' | 'Corroborated' | 'Preliminary' | 'Unverified';

export interface LiveIncidentGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon';
  coordinates: unknown[];
}

export interface PublicLiveIncident {
  id: string;
  fingerprint: string;
  provider: string;
  category: LiveIncidentCategory;
  subcategory: string | null;
  title: string;
  summary: string;
  status: 'active' | 'updated' | 'resolving';
  publicationState: 'published' | 'preliminary';
  verificationLevel: LiveIncidentVerification;
  confidence: number;
  severity: 1 | 2 | 3 | 4 | 5;
  geometry: LiveIncidentGeometry;
  centroid: { latitude: number; longitude: number };
  locationLabel: string;
  locationPrecision: 'exact-area' | 'road-segment' | 'postcode-sector' | 'district' | 'unknown';
  affectedRadiusMetres: number;
  firstObservedAt: string;
  sourceOccurredAt: string | null;
  lastObservedAt: string;
  resolvedAt: string | null;
  expiresAt: string;
  independentSourceCount: number;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  sourceUrl: string | null;
  sourceUpdatedAt: string | null;
}

export interface LiveIncidentSourceState {
  sourceId?: string;
  id?: string;
  state: 'enabled' | 'healthy' | 'stale' | 'failed' | 'disabled' | 'not-configured';
  disclosure?: string;
  lastSuccessAt?: string | null;
  lastAttemptAt?: string | null;
  [key: string]: unknown;
}

export interface LiveIncidentCoverage {
  countries: string[];
  regions: string[];
  kind: string;
}

export interface LiveIncidentListResponse {
  generatedAt: string;
  query: { latitude: number; longitude: number; radiusKm: number; limit: number };
  network: {
    status: string;
    durability: string;
    persistent: boolean;
    disclosure: string;
    coverage: Array<{ id: string; coverage: LiveIncidentCoverage }>;
  };
  coverage: LiveIncidentCoverage[];
  sources: LiveIncidentSourceState[];
  incidents: PublicLiveIncident[];
  disclaimer: string;
}

export interface LiveIncidentMapMarker {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  summary: string;
  category: LiveIncidentCategory;
  categoryLabel: string;
  severity: 1 | 2 | 3 | 4 | 5;
  color: string;
  softColor: string;
  affectedRadiusMetres: number;
  providerLabel: string;
  verificationLabel: LiveIncidentVerification;
  locationLabel: string;
  locationPrecisionLabel: string;
  sourceUpdatedAt: string | null;
  sourceUrl: string | null;
}

export interface LiveIncidentCard extends LiveIncidentMapMarker {
  updatedAtLabel: string;
}

export interface LiveIncidentMapModel {
  markers: LiveIncidentMapMarker[];
  cards: LiveIncidentCard[];
  summary: {
    tone: 'clear' | 'info' | 'caution' | 'danger' | 'limited';
    title: string;
    detail: string;
  };
  generatedAt: string | null;
  disclaimer: string;
  sources: LiveIncidentSourceState[];
}
