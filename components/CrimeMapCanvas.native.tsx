import React, { useEffect, useRef } from 'react';
import MapView, { Circle, Marker, Polygon } from 'react-native-maps';
import { CrimeMapCanvasProps } from './map-types';

export default function CrimeMapCanvas({
  center,
  markers,
  selectedPoint,
  areaPoints,
  boundaryPoints,
  radiusMeters,
  dataKey,
  onMapPress,
  onOpenEvidence,
}: CrimeMapCanvasProps) {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    mapRef.current?.animateToRegion({ ...center, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 450);
  }, [center.latitude, center.longitude]);

  return (
    <MapView
      ref={mapRef}
      style={{ width: '100%', height: 390 }}
      initialRegion={{ ...center, latitudeDelta: 0.025, longitudeDelta: 0.025 }}
      onPress={(event) => onMapPress(event.nativeEvent.coordinate)}
      showsUserLocation
      showsMyLocationButton
      accessibilityLabel="Interactive UK crime map"
    >
      {markers.slice(0, 250).map((marker) => (
        <Marker
          key={marker.id}
          coordinate={marker}
          title={marker.categoryLabel}
          description={[
            `Recorded: ${formatCrimeMonth(marker.month)}`,
            marker.locationStreet,
            ...marker.incidents.slice(0, 4).map((incident, index) => `${index + 1}. ${incident.categoryLabel}${incident.outcome ? ` - ${formatPublicOutcome(incident.outcome)}` : ''}`),
            marker.officialCaseUrl ? 'Tap this card for the official Police.uk case history.' : 'Official case-history link unavailable.',
            marker.incidentCount > 4 ? `+${marker.incidentCount - 4} more reports` : '',
          ].filter(Boolean).join('\n')}
          pinColor={marker.color || '#e11d48'}
          identifier={`${dataKey}:${marker.id}`}
          onCalloutPress={marker.officialCaseUrl && marker.persistentId ? () => onOpenEvidence({
            persistentId: marker.persistentId!,
            category: marker.category || 'other-crime',
            categoryLabel: marker.categoryLabel,
            month: marker.month || '',
            locationStreet: marker.locationStreet,
            officialCaseUrl: marker.officialCaseUrl!,
          }) : undefined}
        />
      ))}
      {selectedPoint && <Marker coordinate={selectedPoint} title="Selected point" pinColor="#4f46e5" />}
      {selectedPoint && radiusMeters && (
        <Circle
          center={selectedPoint}
          radius={radiusMeters}
          fillColor="rgba(79,70,229,0.10)"
          strokeColor="#4f46e5"
          strokeWidth={2}
        />
      )}
      {areaPoints.length >= 2 && (
        <Polygon coordinates={areaPoints} fillColor="rgba(79,70,229,0.14)" strokeColor="#4f46e5" strokeWidth={3} />
      )}
      {boundaryPoints.length >= 3 && (
        <Polygon coordinates={boundaryPoints} fillColor="rgba(14,165,233,0.04)" strokeColor="#0284c7" strokeWidth={2} />
      )}
      {areaPoints.map((point, index) => (
        <Marker key={`area-${index}`} coordinate={point} title={`Area point ${index + 1}`} pinColor="#4f46e5" />
      ))}
    </MapView>
  );
}

function formatCrimeMonth(value?: string) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return value || 'Unknown';
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatPublicOutcome(value: string) {
  return value
    .replace(/;?\s*no suspect identified/gi, '')
    .replace(/\bsuspect\s+/gi, '')
    .trim();
}
