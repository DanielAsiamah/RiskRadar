import { compareWatchSnapshots } from './change-summary.mjs';

function aggregateRoads(...roadGroups) {
  const counts = new Map();

  for (const roads of roadGroups) {
    if (!Array.isArray(roads)) {
      continue;
    }

    for (const road of roads) {
      const name = String(road?.name || '').trim();
      const count = Number(road?.count) || 0;
      if (!name || count <= 0) {
        continue;
      }

      counts.set(name, (counts.get(name) || 0) + count);
    }
  }

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name))
    .slice(0, 10);
}

function buildBriefing(place) {
  if (!place?.available || !place.changeSummary) {
    return {
      headline: 'No watched places are ready yet.',
      detail: 'Add a watched postcode or wait for a fresh analysis to generate your monthly briefing.',
    };
  }

  const directionLabel = place.changeSummary.direction === 'rising'
    ? 'is rising overall'
    : place.changeSummary.direction === 'cooling'
      ? 'is cooling overall'
      : place.changeSummary.direction === 'stable'
        ? 'is holding steady'
        : 'needs more history';

  return {
    headline: `${place.label} ${directionLabel}`,
    detail: place.changeSummary.summary,
  };
}

export function buildWatchSnapshot(analysis, generatedAt = new Date().toISOString()) {
  const crimeData = analysis?.crimeData || {};
  const riskSignalRoads = Array.isArray(crimeData.riskSignalDetails)
    ? crimeData.riskSignalDetails.flatMap((detail) => detail?.roads || [])
    : [];
  const hotspotRoads = Array.isArray(analysis?.hotspotData?.clusters)
    ? analysis.hotspotData.clusters.flatMap((cluster) => cluster?.roads || [])
    : [];

  return {
    dataMonth: crimeData.month || '',
    score: Number(crimeData.crimeScore) || 0,
    totalIncidents: Number(crimeData.totalCrimes) || 0,
    categories: Array.isArray(crimeData.categories)
      ? crimeData.categories
        .map((entry) => ({
          category: entry.category,
          count: Number(entry.count) || 0,
        }))
        .slice(0, 10)
      : [],
    trend: Array.isArray(analysis?.trendData?.monthly)
      ? analysis.trendData.monthly
        .map((point) => ({
          month: point.month,
          total: Number(point.totalCrimes) || 0,
        }))
        .slice(-12)
      : [],
    topRoads: aggregateRoads(riskSignalRoads, hotspotRoads),
    generatedAt,
  };
}

export function buildDashboardView({ places = [], analyses = [], entitlement, selectedWatchId = null }) {
  const analysisByWatchId = new Map(
    analyses
      .filter((entry) => entry?.watchId)
      .map((entry) => [entry.watchId, entry]),
  );

  const dashboardPlaces = places.map((place) => {
    const analysis = analysisByWatchId.get(place.id);

    if (!analysis || analysis.error || !analysis.snapshot) {
      return {
        ...place,
        available: false,
        error: analysis?.error || 'No analysis is available for this watched place yet.',
      };
    }

    const changeSummary = compareWatchSnapshots(analysis.snapshot, analysis.previousSnapshot);

    return {
      ...place,
      available: true,
      snapshot: analysis.snapshot,
      changeSummary,
    };
  });

  const selectedPlace = (
    (selectedWatchId
      ? dashboardPlaces.find((place) => place.id === selectedWatchId && place.available)
      : null)
    || dashboardPlaces.find((place) => place.available)
    || null
  );

  return {
    entitlement,
    briefing: buildBriefing(selectedPlace),
    places: dashboardPlaces,
    selectedPlace,
  };
}
