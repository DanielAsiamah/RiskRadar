import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Circle, CircleMarker, LayerGroup, Polygon, Polyline, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { buildLiveMapViewport } from '../live-incidents/map-viewport';
import { CrimeMapCanvasProps, MapCoordinate } from './map-types';

const UK_BOUNDS: [[number, number], [number, number]] = [
  [49.5, -8.8],
  [61.2, 2.2],
];

function MapEvents({ onMapPress, onFollowInterrupted }: { onMapPress: (coordinate: MapCoordinate) => void; onFollowInterrupted?: () => void }) {
  useMapEvents({
    click: ({ latlng }) => onMapPress({ latitude: latlng.lat, longitude: latlng.lng }),
    dragstart: () => onFollowInterrupted?.(),
  });
  return null;
}

function Recenter({ center, routeKey, followPoint, radiusMeters }: { center: MapCoordinate; routeKey: string; followPoint?: MapCoordinate | null; radiusMeters?: number }) {
  const map = useMap();
  const following = useRef(false);
  useEffect(() => {
    const viewport = buildLiveMapViewport(center, radiusMeters);
    const frame = requestAnimationFrame(() => {
      map.invalidateSize({ pan: false });
      if (routeKey) {
        const points = routeKey.split(';').map((pair) => pair.split(',').map(Number) as [number, number]);
        map.fitBounds(points, { padding: [24, 24], maxZoom: 16, animate: false });
      } else map.setView([center.latitude, center.longitude], viewport.webZoom, { animate: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [center.latitude, center.longitude, routeKey, radiusMeters, map]);
  useEffect(() => {
    if (followPoint) {
      map.setView([followPoint.latitude, followPoint.longitude], following.current ? map.getZoom() : Math.max(15, map.getZoom()), { animate: true });
    }
    following.current = !!followPoint;
  }, [followPoint?.latitude, followPoint?.longitude, map]);
  return null;
}

export default function CrimeMapCanvas({
  center,
  markers,
  liveIncidentMarkers = [],
  selectedPoint,
  selectedPointLabel = 'Selected search location',
  followPoint,
  onFollowInterrupted,
  areaPoints,
  boundaryPoints,
  routeLine,
  routeRiskSamples = [],
  radiusMeters,
  dataKey,
  onMapPress,
  onOpenEvidence,
}: CrimeMapCanvasProps) {
  const routeKey = routeLine?.points.map((point) => `${point.latitude},${point.longitude}`).join(';') ?? '';
  const viewport = buildLiveMapViewport(center, radiusMeters);
  return (
    <div style={{ width: '100%', height: 390 }}>
      <MapContainer
        center={[center.latitude, center.longitude]}
        zoom={viewport.webZoom}
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
        <MapEvents onMapPress={onMapPress} onFollowInterrupted={onFollowInterrupted} />
        <Recenter center={center} routeKey={routeKey} followPoint={followPoint} radiusMeters={radiusMeters} />
        <LayerGroup key={dataKey}>
          {liveIncidentMarkers.map((incident) => (
            <React.Fragment key={`live-${incident.id}`}>
              <Circle
                center={[incident.latitude, incident.longitude]}
                radius={incident.affectedRadiusMetres}
                pathOptions={{ color: incident.color, fillColor: incident.color, fillOpacity: 0.1, weight: 1.5 }}
              />
              <CircleMarker
                center={[incident.latitude, incident.longitude]}
                radius={9}
                pathOptions={{ color: 'white', fillColor: incident.color, fillOpacity: 1, weight: 3 }}
              >
                <Tooltip direction="top" offset={[0, -10]} opacity={1} sticky>
                  <LiveIncidentDetails incident={incident} />
                </Tooltip>
                <Popup><LiveIncidentDetails incident={incident} /></Popup>
              </CircleMarker>
            </React.Fragment>
          ))}
          {routeLine && routeLine.points.length >= 2 ? (
            <Polyline
              positions={routeLine.points.map((point) => [point.latitude, point.longitude])}
              pathOptions={{
                color: riskColor(routeLine.riskLevel),
                opacity: 0.88,
                weight: 6,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          ) : null}
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
          {routeRiskSamples.slice(0, 24).map((sample) => (
            <CircleMarker
              key={`route-risk-${sample.pointIndex}`}
              center={[sample.latitude, sample.longitude]}
              radius={7}
              pathOptions={{ color: 'white', fillColor: riskColor(sample.riskLevel), fillOpacity: 0.95, weight: 2.5 }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky>
                <div style={{ minWidth: 170 }}>
                  <strong>Route risk {sample.score}/100</strong>
                  <br />{sample.basis}
                </div>
              </Tooltip>
            </CircleMarker>
          ))}
        </LayerGroup>
        {selectedPoint && (
          <CircleMarker center={[selectedPoint.latitude, selectedPoint.longitude]} radius={8} pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 1 }}>
            <Tooltip direction="top" opacity={1}>{selectedPointLabel}</Tooltip>
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

function LiveIncidentDetails({ incident }: { incident: NonNullable<CrimeMapCanvasProps['liveIncidentMarkers']>[number] }) {
  return (
    <div style={{ minWidth: 220, maxWidth: 320 }}>
      <strong style={{ color: incident.color }}>LIVE · SEVERITY {incident.severity}</strong>
      <br /><strong>{incident.title}</strong>
      <br />{incident.locationLabel}
      <br />{incident.providerLabel} · {incident.verificationLabel}
      <br />{incident.locationPrecisionLabel}
      {incident.summary ? <><br /><span>{incident.summary}</span></> : null}
      {incident.sourceUpdatedAt ? <><br /><span>Source updated: {formatLiveTimestamp(incident.sourceUpdatedAt)}</span></> : null}
      {isSafeSourceUrl(incident.sourceUrl) ? (
        <><br /><a href={incident.sourceUrl!} target="_blank" rel="noreferrer">Open official source</a></>
      ) : null}
    </div>
  );
}

function isSafeSourceUrl(value: string | null) {
  if (!value) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function formatLiveTimestamp(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Unavailable' : parsed.toLocaleString('en-GB');
}

function riskColor(value?: string) {
  if (value === 'red') return '#e11d48';
  if (value === 'amber') return '#d97706';
  return '#059669';
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
