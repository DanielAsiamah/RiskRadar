import React from 'react';

import CrimeMapCanvas from './CrimeMapCanvas';
import LiveRadar from './LiveRadar';

const liveIncident = {
  id: 'incident-1',
  latitude: 51.5074,
  longitude: -0.1278,
  title: 'Flood warning',
  summary: 'Flooding is expected nearby.',
  category: 'flood' as const,
  categoryLabel: 'Flood warning',
  severity: 4 as const,
  color: '#dc2626',
  softColor: '#fee2e2',
  affectedRadiusMetres: 1_000,
  providerLabel: 'Environment Agency',
  verificationLabel: 'Official' as const,
  locationLabel: 'River Test',
  locationPrecisionLabel: 'Official affected area',
  sourceUpdatedAt: '2026-09-20T08:15:00.000Z',
  sourceUrl: 'https://environment.data.gov.uk/example',
};

export function liveIncidentMapContractFixture() {
  return (
    <CrimeMapCanvas
      center={{ latitude: 51.5074, longitude: -0.1278 }}
      markers={[]}
      liveIncidentMarkers={[liveIncident]}
      areaPoints={[]}
      boundaryPoints={[]}
      onMapPress={() => undefined}
      onOpenEvidence={() => undefined}
    />
  );
}

export function liveIncidentRadarContractFixture() {
  return (
    <LiveRadar
      premium
      membershipAvailable={false}
      status="active"
      permissions={{ foreground: 'granted', background: 'granted', notifications: 'granted' }}
      onboardingVisible={false}
      busy={false}
      currentCoordinate={{ latitude: 51.5074, longitude: -0.1278 }}
      currentReading={null}
      history={[]}
      warning={null}
      alertsReduced={false}
      onBack={() => undefined}
      onOpenUpgrade={() => undefined}
      onDismissOnboarding={() => undefined}
      onStart={async () => undefined}
      onStop={async () => undefined}
      onScanNow={async () => undefined}
      onRequestForeground={async () => undefined}
      onRequestBackground={async () => undefined}
      onRequestNotifications={async () => undefined}
      onToggleReducedAlerts={async () => undefined}
      onMutePostcode={async () => undefined}
    />
  );
}
