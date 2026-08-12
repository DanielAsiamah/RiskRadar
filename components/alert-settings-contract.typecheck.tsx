import React from 'react';

import type { AlertPreferences, AlertPreferencesInput } from '../api/alerts';
import AlertSettings from './AlertSettings';

const preferencesFixture: AlertPreferences = {
  email: 'member@example.com',
  monthlyEmailEnabled: true,
  categoryChangeEnabled: true,
  volumeChangeEnabled: true,
  updatedAt: '2026-08-12T10:00:00.000Z',
};

export const alertSettingsFixture = React.createElement(AlertSettings, {
  preferences: preferencesFixture,
  loading: false,
  saving: false,
  error: null,
  latestDataMonth: '2026-05',
  onBack: () => undefined,
  onRetry: async () => undefined,
  onSave: async (_input: AlertPreferencesInput) => undefined,
});
