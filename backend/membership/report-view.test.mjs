import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMemberReport } from './report-view.mjs';

function createReportFixture() {
  return {
    place: {
      id: 'watch-1',
      label: 'Home',
      postcode: 'SE10 8EP',
      normalizedPostcode: 'SE10 8EP',
      lastCheckedMonth: '2026-05',
      lastSnapshot: null,
      createdAt: '2026-08-01T09:00:00.000Z',
      updatedAt: '2026-08-12T14:30:00.000Z',
      available: true,
      snapshot: {
        dataMonth: '2026-05',
        score: 6,
        totalIncidents: 66,
        categories: [
          { category: 'violent-crime', count: 25 },
          { category: 'anti-social-behaviour', count: 16 },
        ],
        trend: [
          { month: '2026-02', total: 72 },
          { month: '2026-03', total: 70 },
          { month: '2026-04', total: 68 },
          { month: '2026-05', total: 66 },
        ],
        topRoads: [
          { name: 'On or near Blackheath Hill', count: 8 },
          { name: 'On or near Lewisham Dlr', count: 5 },
        ],
        generatedAt: '2026-08-12T14:30:00.000Z',
      },
      changeSummary: {
        direction: 'cooling',
        changePercent: -11,
        baselineAverage: 74,
        scoreDirection: 'cooling',
        categoryMovements: [
          {
            category: 'violent-crime',
            label: 'Violent Crime',
            currentCount: 25,
            previousCount: 28,
            direction: 'cooling',
          },
        ],
        summary: 'Total recorded incidents fell 11% against the previous three-month average, while violent crime cooled slightly.',
      },
    },
    analysis: {
      crimeData: {
        month: '2026-05',
        monthDisplay: 'May 2026',
        crimeScore: 6,
        safetyLevel: 'low risk',
        totalCrimes: 66,
        postcodeRadiusMeters: 400,
        categories: [
          { category: 'violent-crime', count: 25 },
          { category: 'anti-social-behaviour', count: 16 },
          { category: 'burglary', count: 8 },
        ],
        scoreMethod: {
          id: 'postcode-blend-v2',
          name: 'RiskRadar Postcode Blend',
          modelCap: 20,
        },
        capExplanation: 'This postcode score uses a conservative local-plus-context cap.',
        scoreFactors: [
          {
            label: 'Violent crime remains the largest local severity driver.',
            impact: 'up',
            detail: 'Violent crime still contributes the largest share of local severity points.',
          },
        ],
        riskSignalDetails: [
          {
            roads: [
              { name: 'On or near Blackheath Hill', count: 8 },
            ],
            evidence: [
              {
                persistentId: 'crime-1',
                category: 'violent-crime',
                categoryLabel: 'Violent Crime',
                month: '2026-05',
                locationStreet: 'On or near Blackheath Hill',
                officialCaseUrl: 'https://data.police.uk/outcomes-for-crime/crime-1',
              },
            ],
          },
        ],
      },
      postcodeData: {
        admin_district: 'Lewisham',
        postcode: 'SE10 8EP',
      },
      aiAnalysis: {
        summary: 'Lewisham currently scores low risk because of the latest incident volume, the severity mix of recorded offences, and the way those incidents are concentrated around the area.',
        areaContext: 'Road labels and evidence come from anonymised Police.uk monthly records.',
      },
      trendData: {
        direction: 'cooling',
        changePercent: -11,
        summary: 'Recent incidents are cooling slightly.',
        monthly: [
          { month: '2026-02', monthDisplay: 'February 2026', totalCrimes: 72, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
          { month: '2026-03', monthDisplay: 'March 2026', totalCrimes: 70, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
          { month: '2026-04', monthDisplay: 'April 2026', totalCrimes: 68, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
          { month: '2026-05', monthDisplay: 'May 2026', totalCrimes: 66, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 },
        ],
      },
      hotspotData: {
        summary: 'Clusters remain concentrated around Blackheath Hill and nearby station routes.',
        clusters: [
          {
            roads: [
              { name: 'On or near Blackheath Hill', count: 3 },
              { name: 'On or near Lewisham Dlr', count: 2 },
            ],
            evidence: [
              {
                persistentId: 'crime-2',
                category: 'anti-social-behaviour',
                categoryLabel: 'Anti Social Behaviour',
                month: '2026-05',
                locationStreet: 'On or near Lewisham Dlr',
                officialCaseUrl: 'https://data.police.uk/outcomes-for-crime/crime-2',
              },
            ],
          },
        ],
      },
      newsLink: 'https://news.google.com/search?q=Lewisham%20crime',
    },
  };
}

test('builds a printable member report view with trend, roads, and official evidence', () => {
  const { place, analysis } = createReportFixture();

  const report = buildMemberReport({
    place,
    analysis,
    generatedAt: '2026-08-12T14:30:00.000Z',
  });

  assert.equal(report.watchId, 'watch-1');
  assert.equal(report.label, 'Home');
  assert.equal(report.postcode, 'SE10 8EP');
  assert.equal(report.adminDistrict, 'Lewisham');
  assert.equal(report.generatedAt, '2026-08-12T14:30:00.000Z');
  assert.equal(report.dataMonth, '2026-05');
  assert.equal(report.dataMonthDisplay, 'May 2026');
  assert.equal(report.postcodeRadiusMeters, 400);
  assert.equal(report.score, 6);
  assert.equal(report.totalIncidents, 66);
  assert.match(report.scoreMethod.name, /postcode blend/i);
  assert.match(report.scoreMethod.explanation, /conservative local-plus-context cap/i);
  assert.equal(report.trend.monthly.length, 4);
  assert.equal(report.categoryChanges[0].label, 'Violent Crime');
  assert.equal(report.hotspotRoads[0].name, 'On or near Blackheath Hill');
  assert.equal(report.officialEvidence.length, 2);
  assert.equal(report.officialEvidence[0].officialCaseUrl.startsWith('https://data.police.uk/'), true);
  assert.match(report.disclaimer, /anonymised police\.uk record/i);
  assert.match(report.summary, /low risk/i);
});
