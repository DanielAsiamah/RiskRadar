import React from 'react';

import LiveRadar from './LiveRadar';

export function liveRadarContractFixture() {
  return (
    <LiveRadar
      premium={false}
      membershipAvailable={false}
      status="disabled"
      permissions={{
        foreground: 'unknown',
        background: 'unknown',
        notifications: 'unknown',
      }}
      onboardingVisible={false}
      busy={false}
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
