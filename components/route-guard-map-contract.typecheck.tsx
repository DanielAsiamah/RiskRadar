import React from 'react';

import CrimeMapCanvas from './CrimeMapCanvas';

export function routeGuardMapContractFixture() {
  return (
    <CrimeMapCanvas
      center={{ latitude: 51.5, longitude: -0.08 }}
      markers={[]}
      selectedPoint={{ latitude: 51.5, longitude: -0.08 }}
      areaPoints={[]}
      boundaryPoints={[]}
      routeLine={{
        points: [
          { latitude: 51.47, longitude: -0.02 },
          { latitude: 51.5, longitude: -0.08 },
        ],
        riskLevel: 'amber',
      }}
      routeRiskSamples={[
        {
          pointIndex: 0,
          latitude: 51.47,
          longitude: -0.02,
          score: 42,
          riskLevel: 'low',
          basis: 'Historical RiskRadar baseline near this route sample.',
        },
        {
          pointIndex: 1,
          latitude: 51.5,
          longitude: -0.08,
          score: 78,
          riskLevel: 'red',
          basis: 'Active live-source impact near this route sample.',
        },
      ]}
      dataKey="route-guard-contract"
      onMapPress={() => undefined}
      onOpenEvidence={() => undefined}
    />
  );
}
