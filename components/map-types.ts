export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface CrimeMapMarker extends MapCoordinate {
  id: string;
  persistentId?: string;
  category?: string;
  categoryLabel: string;
  locationStreet: string;
  outcome?: string;
  outcomeDate?: string;
  month?: string;
  color?: string;
  officialCaseUrl?: string;
  incidentCount: number;
  incidents: Array<{
    persistentId?: string;
    category?: string;
    categoryLabel: string;
    locationStreet: string;
    outcome?: string;
    outcomeDate?: string;
    month?: string;
    officialCaseUrl?: string;
  }>;
}

export type RouteMapRiskLevel = 'low' | 'amber' | 'red';

export interface RouteMapLine {
  points: MapCoordinate[];
  riskLevel: RouteMapRiskLevel;
}

export interface RouteMapRiskSample extends MapCoordinate {
  pointIndex: number;
  score: number;
  riskLevel: RouteMapRiskLevel;
  basis: string;
}

export interface CrimeMapCanvasProps {
  center: MapCoordinate;
  markers: CrimeMapMarker[];
  selectedPoint?: MapCoordinate | null;
  areaPoints: MapCoordinate[];
  boundaryPoints: MapCoordinate[];
  routeLine?: RouteMapLine | null;
  routeRiskSamples?: RouteMapRiskSample[];
  radiusMeters?: number;
  dataKey?: string;
  onMapPress: (coordinate: MapCoordinate) => void;
  onOpenEvidence: (reference: EvidenceReference) => void;
}
import type { EvidenceReference } from '../types';
