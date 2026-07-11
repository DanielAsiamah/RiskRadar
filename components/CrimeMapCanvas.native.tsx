import React, { useEffect, useRef } from 'react';
import MapView, { Circle, Marker, Polygon } from 'react-native-maps';
import { CrimeMapCanvasProps } from './map-types';

export default function CrimeMapCanvas({
  center,
  markers,
  selectedPoint,
  areaPoints,
  radiusMeters,
  onMapPress,
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
          description={marker.locationStreet}
          pinColor="#e11d48"
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
      {areaPoints.map((point, index) => (
        <Marker key={`area-${index}`} coordinate={point} title={`Area point ${index + 1}`} pinColor="#4f46e5" />
      ))}
    </MapView>
  );
}
