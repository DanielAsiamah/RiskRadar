function formatMonth(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) {
    return '';
  }

  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
}

function humanizeCategory(value) {
  return String(value || '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function dedupeEvidence(analysis) {
  const seen = new Set();
  const collected = [];
  const sources = [
    ...(Array.isArray(analysis?.crimeData?.riskSignalDetails) ? analysis.crimeData.riskSignalDetails : []),
    ...(Array.isArray(analysis?.hotspotData?.clusters) ? analysis.hotspotData.clusters : []),
  ];

  for (const source of sources) {
    const evidence = Array.isArray(source?.evidence) ? source.evidence : [];
    for (const item of evidence) {
      const persistentId = String(item?.persistentId || '').trim();
      if (!persistentId || seen.has(persistentId)) {
        continue;
      }

      seen.add(persistentId);
      collected.push({
        persistentId,
        category: item.category,
        categoryLabel: item.categoryLabel || humanizeCategory(item.category),
        month: item.month,
        monthDisplay: formatMonth(item.month),
        locationStreet: item.locationStreet || 'Approximate mapped road',
        officialCaseUrl: item.officialCaseUrl || '',
      });
    }
  }

  return collected.slice(0, 12);
}

export function buildMemberReport({ place, analysis, generatedAt = new Date().toISOString() }) {
  const snapshot = place?.snapshot || null;
  const changeSummary = place?.changeSummary || null;
  const scoreMethod = analysis?.crimeData?.scoreMethod || {};
  const scoreFactors = Array.isArray(analysis?.crimeData?.scoreFactors)
    ? analysis.crimeData.scoreFactors
    : [];
  const trendMonthly = Array.isArray(analysis?.trendData?.monthly)
    ? analysis.trendData.monthly.slice(-12)
    : [];

  return {
    watchId: place?.id || '',
    title: `${place?.label || 'Watched place'} Premium safety report`,
    label: place?.label || '',
    postcode: place?.postcode || '',
    adminDistrict: analysis?.postcodeData?.admin_district || '',
    generatedAt,
    generatedDateDisplay: formatDate(generatedAt),
    dataMonth: snapshot?.dataMonth || analysis?.crimeData?.month || '',
    dataMonthDisplay: analysis?.crimeData?.monthDisplay || formatMonth(snapshot?.dataMonth),
    postcodeRadiusMeters: Number(analysis?.crimeData?.postcodeRadiusMeters) || 400,
    score: Number(snapshot?.score ?? analysis?.crimeData?.crimeScore) || 0,
    safetyLevel: String(analysis?.crimeData?.safetyLevel || ''),
    totalIncidents: Number(snapshot?.totalIncidents ?? analysis?.crimeData?.totalCrimes) || 0,
    summary: analysis?.aiAnalysis?.summary || '',
    areaContext: analysis?.aiAnalysis?.areaContext || '',
    changeSummary: changeSummary?.summary || '',
    scoreMethod: {
      id: scoreMethod.id || null,
      name: scoreMethod.name || 'RiskRadar postcode model',
      modelCap: Number.isFinite(scoreMethod.modelCap) ? scoreMethod.modelCap : null,
      explanation: analysis?.crimeData?.capExplanation || null,
      factors: scoreFactors.map((factor) => ({
        label: factor.label,
        impact: factor.impact,
        detail: factor.detail,
      })),
    },
    trend: {
      direction: analysis?.trendData?.direction || 'stable',
      changePercent: Number(analysis?.trendData?.changePercent) || 0,
      summary: analysis?.trendData?.summary || '',
      monthly: trendMonthly,
    },
    categoryBreakdown: Array.isArray(snapshot?.categories)
      ? snapshot.categories.map((entry) => ({
        category: entry.category,
        label: humanizeCategory(entry.category),
        count: Number(entry.count) || 0,
      }))
      : [],
    categoryChanges: Array.isArray(changeSummary?.categoryMovements)
      ? changeSummary.categoryMovements.map((movement) => ({
        category: movement.category,
        label: movement.label,
        currentCount: movement.currentCount,
        previousCount: movement.previousCount,
        direction: movement.direction,
      }))
      : [],
    hotspotRoads: Array.isArray(snapshot?.topRoads) ? snapshot.topRoads : [],
    officialEvidence: dedupeEvidence(analysis),
    sourceLinks: {
      policeDashboard: 'https://data.police.uk/',
      newsSearch: analysis?.newsLink || null,
    },
    disclaimer: 'This is an informational risk estimate built from anonymised Police.uk records. It reflects approximate mapped roads, recorded months, and area intelligence rather than exact incident addresses, exact incident days, or emergency guidance.',
  };
}
