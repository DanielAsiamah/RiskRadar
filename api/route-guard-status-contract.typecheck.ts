import { getRouteGuardStatus, type RouteGuardStatus } from './route-guard';

export const routeGuardReadyStatusFixture: RouteGuardStatus = {
  ready: true,
  provider: 'free-osm',
  usage: {
    entitlement: 'pro',
    includedMonthlyScans: 100,
    period: 'calendar-month',
  },
  google: {
    required: false,
    configured: false,
    requestMadeByStatus: false,
    note: 'Route Guard is using free public routing in this environment.',
  },
  supabase: {
    requiredForRouteScan: false,
    note: 'Local route scans can run before Supabase subscription persistence is configured.',
  },
  disclaimer: 'Route Guard is area intelligence, not guaranteed safety.',
};

export async function routeGuardStatusContract() {
  const status = await getRouteGuardStatus();
  const provider: 'mock' | 'free-osm' | 'unavailable' = status.provider;
  const includedMonthlyScans: 100 = status.usage.includedMonthlyScans;
  const googleRequestMadeByStatus: false = status.google.requestMadeByStatus;
  return { provider, includedMonthlyScans, googleRequestMadeByStatus };
}
