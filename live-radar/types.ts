export type LiveRadarRiskLevel = 'low' | 'moderate' | 'elevated' | 'high';

export type LiveRadarReadingSource = 'manual' | 'background' | 'web-session';

export type LiveRadarTrigger =
  | 'entered-higher-risk-area'
  | 'score-threshold'
  | 'sharp-jump';

export type LiveRadarMode = 'native-background' | 'web-session';

export type LiveRadarAccuracyState = 'good' | 'poor';

export type LiveRadarPermissionState = 'unknown' | 'granted' | 'denied' | 'unsupported';

export interface LiveRadarSettings {
  enabled: boolean;
  mode: LiveRadarMode;
  alertsReduced: boolean;
  mutedPostcodes: string[];
  lastAlertAt: string | null;
  onboardingCompleted: boolean;
}

export interface LiveRadarReading {
  checkedAt: string;
  postcode: string;
  score: number;
  riskLevel: LiveRadarRiskLevel;
  mainReason: string;
  dataMonth: string | null;
  accuracyMetres: number | null;
  accuracyState: LiveRadarAccuracyState;
  source: LiveRadarReadingSource;
}

export interface LiveRadarAlertEvent {
  id: string;
  createdAt: string;
  postcode: string;
  score: number;
  riskLevel: LiveRadarRiskLevel;
  trigger: LiveRadarTrigger;
  explanation: string;
  notificationSent: boolean;
}

export interface LiveRadarPermissionSnapshot {
  foreground: LiveRadarPermissionState;
  background: LiveRadarPermissionState;
  notifications: LiveRadarPermissionState;
}

export interface LiveRadarStore {
  settings: LiveRadarSettings;
  history: LiveRadarAlertEvent[];
  currentReading: LiveRadarReading | null;
  permissions: LiveRadarPermissionSnapshot;
  lastWarning: string | null;
}

export interface EvaluateLiveRadarTransitionInput {
  previousReading: LiveRadarReading | null;
  nextReading: LiveRadarReading;
  settings: LiveRadarSettings;
  nowIso: string;
}

export interface EvaluateLiveRadarTransitionResult {
  shouldAlert: boolean;
  trigger?: LiveRadarTrigger;
  explanation?: string;
  suppressedByCooldown?: boolean;
  suppressedByMute?: boolean;
}
