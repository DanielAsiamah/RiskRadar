import React from 'react';

import type { DashboardView } from '../membership/dashboard-types';
import MonthlyBriefing from './MonthlyBriefing';
import PremiumDashboard from './PremiumDashboard';
import WatchedPlaceCard from './WatchedPlaceCard';
import WatchPlaceForm from './WatchPlaceForm';
import type { TrustNavigation } from './SiteFooter';

const trustNavigation: TrustNavigation = {
  onOpenFaq: () => undefined,
  onOpenMethodology: () => undefined,
  onOpenLimitations: () => undefined,
  onOpenChangelog: () => undefined,
  onOpenAbout: () => undefined,
  onOpenPrivacy: () => undefined,
  onOpenAdvertise: () => undefined,
};

const dashboardFixture: DashboardView = {
  entitlement: {
    configured: true,
    authenticated: true,
    email: 'member@example.com',
    status: 'active',
    premium: true,
    currentPeriodEnd: '2026-09-12T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    canManageBilling: true,
  },
  briefing: {
    headline: 'Home is cooling overall',
    detail: 'Total recorded incidents fell 11% against the previous three-month average, while violent crime rose slightly.',
  },
  places: [],
  selectedPlace: null,
};

export const monthlyBriefingFixture = React.createElement(MonthlyBriefing, {
  briefing: dashboardFixture.briefing,
});

export const watchPlaceFormFixture = React.createElement(WatchPlaceForm, {
  initialLabel: 'Home',
  initialPostcode: 'SE10 8EP',
  busy: false,
  onSubmit: async (_input: { label: string; postcode: string }) => undefined,
  onCancel: () => undefined,
});

export const watchedPlaceCardFixture = React.createElement(WatchedPlaceCard, {
  place: {
    id: 'watch-1',
    label: 'Home',
    postcode: 'SE10 8EP',
    normalizedPostcode: 'SE10 8EP',
    lastCheckedMonth: '2026-05',
    lastSnapshot: {
      dataMonth: '2026-05',
      score: 6,
      totalIncidents: 66,
      categories: [{ category: 'violent-crime', count: 25 }],
      trend: [{ month: '2026-05', total: 66 }],
      topRoads: [{ name: 'On or near Blackheath Hill', count: 8 }],
      generatedAt: '2026-08-12T10:00:00.000Z',
    },
    createdAt: '2026-08-12T10:00:00.000Z',
    updatedAt: '2026-08-12T10:00:00.000Z',
    available: true,
    snapshot: {
      dataMonth: '2026-05',
      score: 6,
      totalIncidents: 66,
      categories: [{ category: 'violent-crime', count: 25 }],
      trend: [{ month: '2026-05', total: 66 }],
      topRoads: [{ name: 'On or near Blackheath Hill', count: 8 }],
      generatedAt: '2026-08-12T10:00:00.000Z',
    },
    changeSummary: {
      direction: 'cooling',
      changePercent: -11,
      baselineAverage: 74,
      scoreDirection: 'cooling',
      categoryMovements: [{
        category: 'violent-crime',
        label: 'Violent Crime',
        currentCount: 25,
        previousCount: 28,
        direction: 'cooling',
      }],
      summary: 'Total recorded incidents fell 11% against the previous three-month average, while violent crime cooled slightly.',
    },
  },
  selected: true,
  onSelect: () => undefined,
  onRename: async (_id: string, _label: string) => undefined,
  onRemove: async (_id: string) => undefined,
  busy: false,
});

export const premiumDashboardFixture = React.createElement(PremiumDashboard, {
  dashboard: dashboardFixture,
  loading: false,
  saving: false,
  error: null,
  pendingPostcode: 'SE10 8EP',
  onBack: () => undefined,
  onRefresh: async () => undefined,
  onAddWatchedPlace: async (_input: { label: string; postcode: string }) => undefined,
  onRenameWatchedPlace: async (_id: string, _label: string) => undefined,
  onRemoveWatchedPlace: async (_id: string) => undefined,
  onSelectWatchedPlace: async (_id: string) => undefined,
  onClearPendingPostcode: () => undefined,
  onOpenCompare: () => undefined,
  onOpenLiveRadar: () => undefined,
  onOpenAlertSettings: () => undefined,
  onOpenReport: (_watchId: string) => undefined,
  trustNavigation,
});
