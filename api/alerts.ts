import { apiRequest } from './client';

export interface AlertPreferences {
  email: string | null;
  monthlyEmailEnabled: boolean;
  categoryChangeEnabled: boolean;
  volumeChangeEnabled: boolean;
  updatedAt: string | null;
}

export interface AlertPreferencesInput {
  monthlyEmailEnabled: boolean;
  categoryChangeEnabled: boolean;
  volumeChangeEnabled: boolean;
}

export function getAlertPreferences(timeoutMs = 40_000, signal?: AbortSignal): Promise<AlertPreferences> {
  return apiRequest<AlertPreferences>('/api/alert-preferences', { signal }, timeoutMs, 'required');
}

export function updateAlertPreferences(
  input: AlertPreferencesInput,
  timeoutMs = 40_000,
  signal?: AbortSignal,
): Promise<AlertPreferences> {
  return apiRequest<AlertPreferences>('/api/alert-preferences', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal,
  }, timeoutMs, 'required');
}
