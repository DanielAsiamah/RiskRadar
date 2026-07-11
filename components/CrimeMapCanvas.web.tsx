import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, Polygon, Popup, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CrimeMapCanvasProps, MapCoordinate } from './map-types';

function MapEvents({ onMapPress }: { onMapPress: (coordinate: MapCoordinate) => void }) {
  useMapEvents({
    click: ({ latlng }) => onMapPress({ latitude: latlng.lat, longitude: latlng.lng }),
  });
  return null;
}

function Recenter({ center }: { center: MapCoordinate }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([center.latitude, center.longitude], 14, { duration: 0.5 });
  }, [center.latitude, center.longitude, map]);
  return null;
}

export default function CrimeMapCanvas({
  center,
  markers,
  selectedPoint,
  areaPoints,
  radiusMeters,
  onMapPress,
}: CrimeMapCanvasProps) {
  return (
    <div style={{ width: '100%', height: 390 }}>
      <MapContainer center={[center.latitude, center.longitude]} zoom={14} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapEvents onMapPress={onMapPress} />
        <Recenter center={center} />
        {markers.slice(0, 500).map((marker) => (
          <CircleMarker key={marker.id} center={[marker.latitude, marker.longitude]} radius={5} pathOptions={{ color: '#e11d48', fillOpacity: 0.72 }}>
            <Popup><strong>{marker.categoryLabel}</strong><br />{marker.locationStreet}</Popup>
          </CircleMarker>
        ))}
        {selectedPoint && (
          <CircleMarker center={[selectedPoint.latitude, selectedPoint.longitude]} radius={8} pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 1 }} />
        )}
        {selectedPoint && radiusMeters && (
          <Circle center={[selectedPoint.latitude, selectedPoint.longitude]} radius={radiusMeters} pathOptions={{ color: '#4f46e5', fillOpacity: 0.1 }} />
        )}
        {areaPoints.length >= 2 && (
          <Polygon positions={areaPoints.map((point) => [point.latitude, point.longitude])} pathOptions={{ color: '#4f46e5', fillOpacity: 0.14 }} />
        )}
        {areaPoints.map((point, index) => (
          <CircleMarker key={`area-${index}`} center={[point.latitude, point.longitude]} radius={6} pathOptions={{ color: '#4f46e5', fillColor: 'white', fillOpacity: 1 }} />
        ))}
      </MapContainer>
    </div>
  );
}
