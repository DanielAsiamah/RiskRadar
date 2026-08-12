import React from 'react';

import type { MemberReport } from '../api/reports';
import MemberReportScreen from './MemberReport';
import PrintReport from './PrintReport';

const reportFixture: MemberReport = {
  watchId: 'watch-1',
  title: 'Home Premium safety report',
  label: 'Home',
  postcode: 'SE10 8EP',
  adminDistrict: 'Lewisham',
  generatedAt: '2026-08-12T14:30:00.000Z',
  generatedDateDisplay: '12 August 2026',
  dataMonth: '2026-05',
  dataMonthDisplay: 'May 2026',
  postcodeRadiusMeters: 400,
  score: 6,
  safetyLevel: 'low risk',
  totalIncidents: 66,
  summary: 'Lewisham currently scores low risk because of the latest incident volume.',
  areaContext: 'Road labels and evidence come from anonymised Police.uk monthly records.',
  changeSummary: 'Total recorded incidents fell 11% against the previous three-month average.',
  scoreMethod: {
    id: 'postcode-blend-v2',
    name: 'RiskRadar Postcode Blend',
    modelCap: 20,
    explanation: 'This postcode score uses a conservative local-plus-context cap.',
    factors: [{
      label: 'Violent crime remains the largest local severity driver.',
      impact: 'up',
      detail: 'Violent crime still contributes the largest share of local severity points.',
    }],
  },
  trend: {
    direction: 'cooling',
    changePercent: -11,
    summary: 'Recent incidents are cooling slightly.',
    monthly: [{
      month: '2026-05',
      monthDisplay: 'May 2026',
      totalCrimes: 66,
      violentCrimes: 25,
      antiSocialCrimes: 16,
      robberyCrimes: 0,
      dataAvailable: true,
    }],
  },
  categoryBreakdown: [{ category: 'violent-crime', label: 'Violent Crime', count: 25 }],
  categoryChanges: [{
    category: 'violent-crime',
    label: 'Violent Crime',
    currentCount: 25,
    previousCount: 28,
    direction: 'cooling',
  }],
  hotspotRoads: [{ name: 'On or near Blackheath Hill', count: 8 }],
  officialEvidence: [{
    persistentId: 'crime-1',
    category: 'violent-crime',
    categoryLabel: 'Violent Crime',
    month: '2026-05',
    monthDisplay: 'May 2026',
    locationStreet: 'On or near Blackheath Hill',
    officialCaseUrl: 'https://data.police.uk/outcomes-for-crime/crime-1',
  }],
  sourceLinks: {
    policeDashboard: 'https://data.police.uk/',
    newsSearch: null,
  },
  disclaimer: 'This is an informational risk estimate.',
};

export const memberReportScreenFixture = React.createElement(MemberReportScreen, {
  report: reportFixture,
  loading: false,
  error: null,
  onBack: () => undefined,
  onRetry: async () => undefined,
});

export const printReportFixture = React.createElement(PrintReport, {
  report: reportFixture,
});
