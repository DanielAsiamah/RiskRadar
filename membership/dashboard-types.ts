import type { AccountEntitlement } from './types';

export type ChangeDirection = 'rising' | 'cooling' | 'stable' | 'insufficient-data';

export interface WatchSnapshotCategory {
  category: string;
  count: number;
}

export interface WatchSnapshotTrendPoint {
  month: string;
  total: number;
}

export interface WatchSnapshotRoad {
  name: string;
  count: number;
}

export interface WatchSnapshot {
  dataMonth: string;
  score: number;
  totalIncidents: number;
  categories: WatchSnapshotCategory[];
  trend: WatchSnapshotTrendPoint[];
  topRoads: WatchSnapshotRoad[];
  generatedAt: string;
}

export interface CategoryMovement {
  category: string;
  label: string;
  currentCount: number;
  previousCount: number;
  direction: Exclude<ChangeDirection, 'insufficient-data'>;
}

export interface ChangeSummary {
  direction: ChangeDirection;
  changePercent: number;
  baselineAverage: number | null;
  scoreDirection: ChangeDirection;
  categoryMovements: CategoryMovement[];
  summary: string;
}

export interface WatchedPlace {
  id: string;
  label: string;
  postcode: string;
  normalizedPostcode: string;
  lastCheckedMonth: string | null;
  lastSnapshot: WatchSnapshot | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DashboardPlace extends WatchedPlace {
  available: boolean;
  snapshot?: WatchSnapshot;
  changeSummary?: ChangeSummary;
  error?: string;
}

export interface DashboardBriefing {
  headline: string;
  detail: string;
}

export interface DashboardView {
  entitlement: AccountEntitlement;
  briefing: DashboardBriefing;
  places: DashboardPlace[];
  selectedPlace: DashboardPlace | null;
}
