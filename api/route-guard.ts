import { apiRequest } from './client';
import type { RouteLiveRefresh } from '../route-guard/refresh';

export type RouteGuardTravelMode = 'walking' | 'driving' | 'transit';
export type RouteGuardRiskLevel = 'low' | 'amber' | 'red';

export interface RouteGuardScanInput {
  start: string;
  startCoordinates?: { latitude: number; longitude: number; accuracyMetres?: number };
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
  latitude?: number;
  longitude?: number;
  score: number;
  riskLevel: RouteGuardRiskLevel;
  basis: string;
  contextLabel?: string;
  contributors?: Array<{ incidentId?: string; category?: string; [key: string]: unknown }>;
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
  provider: 'mock' | 'free-osm';
  googleRequestMade: false;
  start: string;
  destination: string;
  travelMode: RouteGuardTravelMode;
  geocoded?: {
    start: { latitude: number; longitude: number; label: string; confidence: string; source: string; accuracyMetres?: number };
    destination: { latitude: number; longitude: number; label: string; confidence: string; source: string };
  };
  routeProvider?: {
    source: string;
    routingMode: string;
    attribution: string;
    modeDisclosure: string;
  };
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
  fallbackReason?: string;
  disclaimer: string;
}

export interface RouteGuardStatus {
  ready: boolean;
  provider: 'mock' | 'free-osm' | 'unavailable';
  usage: {
    entitlement: 'pro';
    includedMonthlyScans: 100;
    period: 'calendar-month';
  };
  google: {
    required: boolean;
    configured: boolean;
    requestMadeByStatus: false;
    note: string;
  };
  supabase: {
    requiredForRouteScan: boolean;
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

export function getRouteGuardStatus() {
  return apiRequest<RouteGuardStatus>('/api/route-guard/status', {}, 8_000, 'optional');
}

export function refreshRouteGuardRisk(samples: RouteGuardRiskSample[], signal: AbortSignal) {
  return apiRequest<RouteLiveRefresh>('/api/live-risk', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ routeSamples: samples.map((sample) => ({
      id: String(sample.pointIndex), latitude: sample.latitude, longitude: sample.longitude,
    })) }),
  }, 40_000);
}
