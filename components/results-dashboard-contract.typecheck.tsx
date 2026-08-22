import React from 'react';

import type { PostcodeResult } from '../types';
import ComparePostcodes from './ComparePostcodes';
import Results from './Results';

const resultFixture = {
  postcode: 'SE10 8EP',
  postcodeData: {
    admin_district: 'Lewisham',
    longitude: -0.01,
    latitude: 51.48,
    postcode: 'SE10 8EP',
  },
  crimeData: {
    totalCrimes: 66,
    crimeScore: 6,
    safetyLevel: 'low',
    month: '2026-05',
    monthDisplay: 'May 2026',
    categories: [{ category: 'violent-crime', count: 25 }],
  },
  aiAnalysis: {
    summary: 'Low risk overall.',
    whatToAvoid: [],
    safetyTips: [],
    localVibe: 'Urban',
    scoreStory: [],
    areaContext: 'Monthly data only.',
  },
  trendData: {
    monthly: [],
    direction: 'stable',
    changePercent: 0,
    categoryDirection: {
      violentCrimes: 'stable',
      antiSocialCrimes: 'stable',
      robberyCrimes: 'stable',
    },
    summary: 'Stable.',
  },
  premiumInsights: [],
  nearbyRanking: {
    sampledNearbyCount: 4,
    totalCompared: 5,
    localRank: 2,
    saferThanPercent: 75,
    summary: 'SE10 8EP currently scores safer than 75% of the 4 nearby postcodes sampled for this comparison.',
    saferAlternatives: [
      {
        postcode: 'SE10 8AA',
        district: 'Lewisham',
        score: 4,
        totalCrimes: 41,
        scoreDelta: 2,
      },
    ],
  },
  newsLink: null,
} satisfies PostcodeResult;

export const resultsDashboardFixture = React.createElement(Results, {
  result: resultFixture,
  premium: true,
  watchBusy: false,
  onWatchPostcode: async () => undefined,
  onOpenDashboard: () => undefined,
  onOpenEvidence: () => undefined,
  onReset: () => undefined,
});

export const compareDashboardFixture = React.createElement(ComparePostcodes, {
  premium: false,
  onBack: () => undefined,
  onRequirePremium: () => undefined,
});
