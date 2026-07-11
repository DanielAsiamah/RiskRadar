export interface MapCoordinate {
  latitude: number;
  longitude: number;
}

export interface CrimeMapMarker extends MapCoordinate {
  id: string;
  categoryLabel: string;
  locationStreet: string;
}

export interface CrimeMapCanvasProps {
  center: MapCoordinate;
  markers: CrimeMapMarker[];
  selectedPoint?: MapCoordinate | null;
  areaPoints: MapCoordinate[];
  boundaryPoints: MapCoordinate[];
  radiusMeters?: number;
  onMapPress: (coordinate: MapCoordinate) => void;
}
