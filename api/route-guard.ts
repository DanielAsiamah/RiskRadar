import { apiRequest } from './client';

export type RouteGuardTravelMode = 'walking' | 'driving' | 'transit';
export type RouteGuardRiskLevel = 'low' | 'amber' | 'red';

export interface RouteGuardScanInput {
  start: string;
  destination: string;
  travelMode: RouteGuardTravelMode;
  entitlement: 'pro' | 'free';
  routeScansUsed: number;
}

export interface RouteGuardPoint {
  index: number;
  latitude: number;
  longitude: number;
  label: string;
}

export interface RouteGuardRiskSample {
  pointIndex: number;
  score: number;
  riskLevel: RouteGuardRiskLevel;
  basis: string;
}

export interface RouteGuardHotzone {
  id: string;
  startPointIndex: number;
  endPointIndex: number;
  riskScore: number;
  riskLevel: 'amber' | 'red';
  summary: string;
}

export interface RouteGuardScan {
  provider: 'mock';
  googleRequestMade: false;
  start: string;
  destination: string;
  travelMode: RouteGuardTravelMode;
  routePoints: RouteGuardPoint[];
  distanceEstimate: { metres: number; kilometres: number };
  durationEstimate: { minutes: number };
  sampledRiskScores: RouteGuardRiskSample[];
  hotzoneSections: RouteGuardHotzone[];
  overallRiskScore: number;
  overallRiskLevel: RouteGuardRiskLevel;
  usage: {
    entitlement: 'pro';
    includedMonthlyScans: 100;
    usedBefore: number;
    usedAfter: number;
    remaining: number;
    period: 'calendar-month';
  };
  googleCostEstimate: {
    currency: 'USD';
    estimatedRequests: number;
    estimatedCostUsd: number;
    note: string;
  };
  disclaimer: string;
}

export function scanRouteGuard(input: RouteGuardScanInput) {
  return apiRequest<RouteGuardScan>(
    '/api/route-guard',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
    15_000,
    'optional',
  );
}
