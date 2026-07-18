import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, LayerGroup, Polygon, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { CrimeMapCanvasProps, MapCoordinate } from './map-types';

const UK_BOUNDS: [[number, number], [number, number]] = [
  [49.5, -8.8],
  [61.2, 2.2],
];

function MapEvents({ onMapPress }: { onMapPress: (coordinate: MapCoordinate) => void }) {
  useMapEvents({
    click: ({ latlng }) => onMapPress({ latitude: latlng.lat, longitude: latlng.lng }),
  });
  return null;
}

function Recenter({ center }: { center: MapCoordinate }) {
  const map = useMap();
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      map.setView([center.latitude, center.longitude], 14, { animate: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [center.latitude, center.longitude, map]);
  return null;
}

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
  return (
    <div style={{ width: '100%', height: 390 }}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={14}
        minZoom={5}
        maxBounds={UK_BOUNDS}
        maxBoundsViscosity={0.8}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          noWrap
        />
        <MapEvents onMapPress={onMapPress} />
        <Recenter center={center} />
        <LayerGroup key={dataKey}>
          {markers.slice(0, 500).map((marker) => (
            <CircleMarker
              key={marker.id}
              center={[marker.latitude, marker.longitude]}
              radius={5}
              pathOptions={{ color: marker.color || '#e11d48', fillColor: marker.color || '#e11d48', fillOpacity: 0.78, weight: 1.5 }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky>
              <MarkerDetails marker={marker} onOpenEvidence={onOpenEvidence} />
              </Tooltip>
              <Popup><MarkerDetails marker={marker} onOpenEvidence={onOpenEvidence} /></Popup>
            </CircleMarker>
          ))}
        </LayerGroup>
        {selectedPoint && (
          <CircleMarker center={[selectedPoint.latitude, selectedPoint.longitude]} radius={8} pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 1 }}>
            <Tooltip direction="top" opacity={1}>Selected search location</Tooltip>
          </CircleMarker>
        )}
        {selectedPoint && radiusMeters && (
          <Circle center={[selectedPoint.latitude, selectedPoint.longitude]} radius={radiusMeters} pathOptions={{ color: '#4f46e5', fillOpacity: 0.1 }} />
        )}
        {areaPoints.length >= 2 && (
          <Polygon positions={areaPoints.map((point) => [point.latitude, point.longitude])} pathOptions={{ color: '#4f46e5', fillOpacity: 0.14 }} />
        )}
        {boundaryPoints.length >= 3 && (
          <Polygon positions={boundaryPoints.map((point) => [point.latitude, point.longitude])} pathOptions={{ color: '#0284c7', fillOpacity: 0.04, weight: 2 }} />
        )}
        {areaPoints.map((point, index) => (
          <CircleMarker key={`area-${index}`} center={[point.latitude, point.longitude]} radius={6} pathOptions={{ color: '#4f46e5', fillColor: 'white', fillOpacity: 1 }} />
        ))}
      </MapContainer>
    </div>
  );
}

function MarkerDetails({
  marker,
  onOpenEvidence,
}: {
  marker: CrimeMapCanvasProps['markers'][number];
  onOpenEvidence: CrimeMapCanvasProps['onOpenEvidence'];
}) {
  const displayedIncidents = marker.incidents.slice(0, 8);
  return (
    <div style={{ minWidth: 220, maxWidth: 320 }}>
      <strong>{marker.incidentCount === 1 ? marker.incidents[0]?.categoryLabel : `${marker.incidentCount} reports at this mapped location`}</strong>
      <br />Police recorded month: {formatCrimeMonth(marker.month)}
      <br />{marker.locationStreet || 'Street-level location'}
      <div style={{ marginTop: 7, borderTop: '1px solid #e2e8f0', paddingTop: 5 }}>
        {displayedIncidents.map((incident, index) => (
          <div key={`${incident.categoryLabel}-${index}`} style={{ marginTop: index ? 5 : 0 }}>
            <strong>{index + 1}. {incident.categoryLabel}</strong>
            {incident.outcome ? <><br /><span>Outcome: {formatPublicOutcome(incident.outcome)}{incident.outcomeDate ? ` (${formatCrimeMonth(incident.outcomeDate)})` : ''}</span></> : null}
            {incident.officialCaseUrl && incident.persistentId ? (
              <><br /><button
                type="button"
                onClick={() => onOpenEvidence({
                  persistentId: incident.persistentId!,
                  category: incident.category || 'other-crime',
                  categoryLabel: incident.categoryLabel,
                  month: incident.month || '',
                  locationStreet: incident.locationStreet,
                  officialCaseUrl: incident.officialCaseUrl!,
                })}
                style={{ border: 0, padding: 0, background: 'transparent', color: '#4f46e5', fontWeight: 700, cursor: 'pointer' }}
              >View official evidence</button></>
            ) : (
              <><br /><span>Official case-history link unavailable for this report.</span></>
            )}
          </div>
        ))}
        {marker.incidentCount > displayedIncidents.length ? <div style={{ marginTop: 5 }}>+{marker.incidentCount - displayedIncidents.length} more reports</div> : null}
      </div>
    </div>
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
