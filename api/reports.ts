import type { ChangeDirection } from '../membership/dashboard-types';
import type { TrendPoint } from '../types';
import { apiRequest } from './client';

export interface MemberReport {
  watchId: string;
  title: string;
  label: string;
  postcode: string;
  adminDistrict: string;
  generatedAt: string;
  generatedDateDisplay: string;
  dataMonth: string;
  dataMonthDisplay: string;
  postcodeRadiusMeters: number;
  score: number;
  safetyLevel: string;
  totalIncidents: number;
  summary: string;
  areaContext: string;
  changeSummary: string;
  scoreMethod: {
    id: string | null;
    name: string;
    modelCap: number | null;
    explanation: string | null;
    factors: Array<{
      label: string;
      impact: 'up' | 'down' | 'neutral';
      detail: string;
    }>;
  };
  trend: {
    direction: ChangeDirection | 'stable';
    changePercent: number;
    summary: string;
    monthly: TrendPoint[];
  };
  categoryBreakdown: Array<{
    category: string;
    label: string;
    count: number;
  }>;
  categoryChanges: Array<{
    category: string;
    label: string;
    currentCount: number;
    previousCount: number;
    direction: Exclude<ChangeDirection, 'insufficient-data'>;
  }>;
  hotspotRoads: Array<{
    name: string;
    count: number;
  }>;
  officialEvidence: Array<{
    persistentId: string;
    category: string;
    categoryLabel: string;
    month: string;
    monthDisplay: string;
    locationStreet: string;
    officialCaseUrl: string;
  }>;
  sourceLinks: {
    policeDashboard: string;
    newsSearch: string | null;
  };
  disclaimer: string;
}

export function getMemberReport(watchId: string, timeoutMs = 40_000, signal?: AbortSignal): Promise<MemberReport> {
  return apiRequest<MemberReport>(`/api/reports/${encodeURIComponent(watchId)}`, { signal }, timeoutMs, 'required');
}

export interface ReportShareLink {
  watchId: string;
  shareUrl: string;
  expiresAt: string;
}

export function createMemberReportShareLink(watchId: string, timeoutMs = 40_000, signal?: AbortSignal): Promise<ReportShareLink> {
  return apiRequest<ReportShareLink>(`/api/reports/${encodeURIComponent(watchId)}/share`, { signal }, timeoutMs, 'required');
}

export function getSharedMemberReport(token: string, timeoutMs = 40_000, signal?: AbortSignal): Promise<MemberReport> {
  return apiRequest<MemberReport>(`/api/report-share?token=${encodeURIComponent(token)}`, { signal }, timeoutMs, 'none');
}
