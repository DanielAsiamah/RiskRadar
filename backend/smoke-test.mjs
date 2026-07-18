const BASE_URL = String(process.env.RISKRADAR_SMOKE_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const POSTCODE = String(process.env.RISKRADAR_SMOKE_POSTCODE || 'BR1 5NN').trim();
const ADMIN_API_KEY = String(process.env.ADMIN_API_KEY || '').trim();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(ADMIN_API_KEY ? { 'x-api-key': ADMIN_API_KEY } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let json = null;
  if (text) {
    json = JSON.parse(text);
  }

  return {
    response,
    json,
  };
}

async function main() {
  const results = [];

  const health = await requestJson('/health');
  assert(health.response.ok, `/health failed with ${health.response.status}`);
  assert(health.json?.service === 'riskradar-api', 'Unexpected health service id');
  results.push({ step: 'health', ok: true });

  const ready = await requestJson('/ready');
  assert([200, 503].includes(ready.response.status), `/ready returned unexpected status ${ready.response.status}`);
  assert(ready.json?.status, 'Readiness payload missing status');
  results.push({ step: 'ready', ok: true, status: ready.json.status });

  const metadata = await requestJson('/api/filter-metadata');
  assert(metadata.response.ok, `/api/filter-metadata failed with ${metadata.response.status}`);
  assert(Array.isArray(metadata.json?.categories) && metadata.json.categories.length > 0, 'Filter metadata missing categories');
  results.push({ step: 'filter-metadata', ok: true, categories: metadata.json.categories.length });

  const analysis = await requestJson('/api/analyze-postcode', {
    method: 'POST',
    body: JSON.stringify({ query: POSTCODE }),
  });
  assert(analysis.response.ok, `/api/analyze-postcode failed with ${analysis.response.status}`);
  assert(analysis.json?.postcode, 'Analysis payload missing postcode');
  assert(Number.isFinite(analysis.json?.crimeData?.crimeScore), 'Analysis payload missing numeric crime score');
  assert(analysis.json?.crimeData?.scoreMethod?.id === 'uk-local-pressure-v3', 'Analysis payload missing current score model metadata');
  assert(Array.isArray(analysis.json?.crimeData?.scoreBreakdown?.factors), 'Analysis payload missing score factor breakdown');
  assert(analysis.json?.crimeData?.crimeScore >= 1 && analysis.json?.crimeData?.crimeScore <= 95, `${POSTCODE} score is outside the supported model range`);
  results.push({
    step: 'analyze-postcode',
    ok: true,
    postcode: analysis.json.postcode,
    score: analysis.json.crimeData.crimeScore,
  });

  const postcodeIntelligence = await requestJson('/api/postcode-intelligence', {
    method: 'POST',
    body: JSON.stringify({
      postcode: POSTCODE,
      month: analysis.json?.crimeData?.month,
      radiusMeters: 900,
      minimumClusterSize: 2,
      maxClusters: 4,
    }),
  });
  assert(postcodeIntelligence.response.ok, `/api/postcode-intelligence failed with ${postcodeIntelligence.response.status}`);
  assert(Number.isFinite(postcodeIntelligence.json?.analysis?.crimeData?.crimeScore), 'Postcode intelligence missing analysis payload');
  assert(Array.isArray(postcodeIntelligence.json?.nearby), 'Postcode intelligence missing nearby suggestions');
  assert(Array.isArray(postcodeIntelligence.json?.hotspotMap?.clusters), 'Postcode intelligence missing hotspot clusters');
  results.push({
    step: 'postcode-intelligence',
    ok: true,
    nearby: postcodeIntelligence.json.nearby.length,
    hotspotClusters: postcodeIntelligence.json?.hotspotMap?.clusterCount ?? 0,
  });

  const unifiedPostcodeFeed = await requestJson('/api/map-feed', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'postcode',
      postcode: POSTCODE,
      month: analysis.json?.crimeData?.month,
      radiusMeters: 900,
    }),
  });
  assert(unifiedPostcodeFeed.response.ok, `/api/map-feed postcode failed with ${unifiedPostcodeFeed.response.status}`);
  assert(unifiedPostcodeFeed.json?.mode === 'postcode', 'Unified postcode feed returned unexpected mode');
  assert(Array.isArray(unifiedPostcodeFeed.json?.result?.crimes), 'Unified postcode feed missing crimes array');
  results.push({
    step: 'map-feed-postcode',
    ok: true,
  });

  const unifiedPostcode = await requestJson('/api/map-intelligence', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'postcode',
      postcode: POSTCODE,
      month: analysis.json?.crimeData?.month,
      radiusMeters: 900,
      minimumClusterSize: 2,
      maxClusters: 4,
    }),
  });
  assert(unifiedPostcode.response.ok, `/api/map-intelligence postcode failed with ${unifiedPostcode.response.status}`);
  assert(unifiedPostcode.json?.mode === 'postcode', 'Unified postcode intelligence returned unexpected mode');
  assert(Number.isFinite(unifiedPostcode.json?.result?.analysis?.crimeData?.crimeScore), 'Unified postcode intelligence missing analysis payload');
  results.push({
    step: 'map-intelligence-postcode',
    ok: true,
  });

  const pointAnalysis = await requestJson('/api/analyze-point', {
    method: 'POST',
    body: JSON.stringify({
      lat: analysis.json?.postcodeData?.latitude,
      lng: analysis.json?.postcodeData?.longitude,
      monthCount: 6,
    }),
  });
  assert(pointAnalysis.response.ok, `/api/analyze-point failed with ${pointAnalysis.response.status}`);
  assert(Number.isFinite(pointAnalysis.json?.crimeData?.crimeScore), 'Point analysis payload missing numeric crime score');
  results.push({
    step: 'analyze-point',
    ok: true,
    label: pointAnalysis.json.label,
    score: pointAnalysis.json.crimeData.crimeScore,
  });

  const comparePoints = await requestJson('/api/compare-points', {
    method: 'POST',
    body: JSON.stringify({
      points: [
        {
          lat: analysis.json?.postcodeData?.latitude,
          lng: analysis.json?.postcodeData?.longitude,
          label: `${analysis.json?.postcode || POSTCODE} anchor`,
          monthCount: 6,
        },
        {
          lat: analysis.json?.postcodeData?.latitude + 0.003,
          lng: analysis.json?.postcodeData?.longitude + 0.003,
          label: 'Nearby comparison point',
          monthCount: 6,
        },
      ],
    }),
  });
  assert(comparePoints.response.ok, `/api/compare-points failed with ${comparePoints.response.status}`);
  assert(Array.isArray(comparePoints.json?.results) && comparePoints.json.results.length >= 1, 'Point comparison missing results');
  results.push({
    step: 'compare-points',
    ok: true,
    points: comparePoints.json.results.length,
  });

  const unifiedComparePostcodes = await requestJson('/api/map-compare', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'postcode',
      postcodes: [POSTCODE, 'SW1A 1AA'],
    }),
  });
  assert(unifiedComparePostcodes.response.ok, `/api/map-compare postcode failed with ${unifiedComparePostcodes.response.status}`);
  assert(unifiedComparePostcodes.json?.mode === 'postcode', 'Unified postcode compare returned unexpected mode');
  assert(Array.isArray(unifiedComparePostcodes.json?.result?.results), 'Unified postcode compare missing results');
  results.push({
    step: 'map-compare-postcode',
    ok: true,
  });

  const locationCrimes = await requestJson('/api/location-crimes', {
    method: 'POST',
    body: JSON.stringify({
      lat: analysis.json?.postcodeData?.latitude,
      lng: analysis.json?.postcodeData?.longitude,
      month: analysis.json?.crimeData?.month,
    }),
  });
  assert(locationCrimes.response.ok, `/api/location-crimes failed with ${locationCrimes.response.status}`);
  assert(Array.isArray(locationCrimes.json?.crimes), 'Exact location crime feed missing crimes array');
  results.push({
    step: 'location-crimes',
    ok: true,
    totalCrimes: locationCrimes.json.totalCrimes,
  });

  const pointIntelligence = await requestJson('/api/point-intelligence', {
    method: 'POST',
    body: JSON.stringify({
      lat: analysis.json?.postcodeData?.latitude,
      lng: analysis.json?.postcodeData?.longitude,
      month: analysis.json?.crimeData?.month,
      monthCount: 6,
      radiusMeters: 900,
      minimumClusterSize: 2,
      maxClusters: 4,
    }),
  });
  assert(pointIntelligence.response.ok, `/api/point-intelligence failed with ${pointIntelligence.response.status}`);
  assert(Number.isFinite(pointIntelligence.json?.analysis?.crimeData?.crimeScore), 'Point intelligence missing analysis payload');
  assert(Array.isArray(pointIntelligence.json?.nearby), 'Point intelligence missing nearby suggestions');
  assert(Array.isArray(pointIntelligence.json?.boundary?.boundary), 'Point intelligence missing boundary payload');
  results.push({
    step: 'point-intelligence',
    ok: true,
    nearby: pointIntelligence.json.nearby.length,
    hotspotClusters: pointIntelligence.json?.hotspotMap?.clusterCount ?? 0,
  });

  const unifiedComparePoints = await requestJson('/api/map-compare', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'point',
      points: [
        {
          lat: analysis.json?.postcodeData?.latitude,
          lng: analysis.json?.postcodeData?.longitude,
          label: `${analysis.json?.postcode || POSTCODE} anchor`,
          monthCount: 6,
        },
        {
          lat: analysis.json?.postcodeData?.latitude + 0.003,
          lng: analysis.json?.postcodeData?.longitude + 0.003,
          label: 'Nearby comparison point',
          monthCount: 6,
        },
      ],
    }),
  });
  assert(unifiedComparePoints.response.ok, `/api/map-compare point failed with ${unifiedComparePoints.response.status}`);
  assert(unifiedComparePoints.json?.mode === 'point', 'Unified point compare returned unexpected mode');
  assert(Array.isArray(unifiedComparePoints.json?.result?.results), 'Unified point compare missing results');
  results.push({
    step: 'map-compare-point',
    ok: true,
  });

  const unifiedPointFeed = await requestJson('/api/map-feed', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'point',
      lat: analysis.json?.postcodeData?.latitude,
      lng: analysis.json?.postcodeData?.longitude,
      month: analysis.json?.crimeData?.month,
      radiusMeters: 900,
    }),
  });
  assert(unifiedPointFeed.response.ok, `/api/map-feed point failed with ${unifiedPointFeed.response.status}`);
  assert(unifiedPointFeed.json?.mode === 'point', 'Unified point feed returned unexpected mode');
  assert(Array.isArray(unifiedPointFeed.json?.result?.crimes), 'Unified point feed missing crimes array');
  results.push({
    step: 'map-feed-point',
    ok: true,
  });

  const unifiedPoint = await requestJson('/api/map-intelligence', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'point',
      lat: analysis.json?.postcodeData?.latitude,
      lng: analysis.json?.postcodeData?.longitude,
      month: analysis.json?.crimeData?.month,
      monthCount: 6,
      radiusMeters: 900,
      minimumClusterSize: 2,
      maxClusters: 4,
    }),
  });
  assert(unifiedPoint.response.ok, `/api/map-intelligence point failed with ${unifiedPoint.response.status}`);
  assert(unifiedPoint.json?.mode === 'point', 'Unified point intelligence returned unexpected mode');
  assert(Number.isFinite(unifiedPoint.json?.result?.analysis?.crimeData?.crimeScore), 'Unified point intelligence missing analysis payload');
  results.push({
    step: 'map-intelligence-point',
    ok: true,
  });

  const monthly = await requestJson('/api/monthly-crime-series', {
    method: 'POST',
    body: JSON.stringify({ postcode: POSTCODE, monthCount: 6 }),
  });
  assert(monthly.response.ok, `/api/monthly-crime-series failed with ${monthly.response.status}`);
  assert(Array.isArray(monthly.json?.monthly), 'Monthly crime series missing monthly array');
  assert(Number.isFinite(monthly.json?.dataQuality?.loadedMonths), 'Monthly crime series missing completeness metadata');
  assert(monthly.json.monthly.every((point) => typeof point.dataAvailable === 'boolean'), 'Monthly points must identify unavailable data');
  results.push({
    step: 'monthly-crime-series',
    ok: true,
    months: monthly.json.monthly.length,
    loadedMonths: monthly.json.dataQuality.loadedMonths,
  });

  const areaAnalysis = await requestJson('/api/analyze-area', {
    method: 'POST',
    body: JSON.stringify({
      label: 'Smoke Patch',
      points: [
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude + 0.002 },
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude + 0.002 }
      ],
      monthCount: 6,
      minimumClusterSize: 3,
      maxClusters: 4,
    }),
  });
  assert(areaAnalysis.response.ok, `/api/analyze-area failed with ${areaAnalysis.response.status}`);
  assert(Number.isFinite(areaAnalysis.json?.crimeData?.crimeScore), 'Area analysis payload missing numeric crime score');
  results.push({
    step: 'analyze-area',
    ok: true,
    label: areaAnalysis.json.label,
    score: areaAnalysis.json.crimeData.crimeScore,
  });

  const areaIntelligence = await requestJson('/api/area-intelligence', {
    method: 'POST',
    body: JSON.stringify({
      label: 'Smoke Patch',
      points: [
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude + 0.002 },
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude + 0.002 }
      ],
      monthCount: 6,
      minimumClusterSize: 2,
      maxClusters: 4,
    }),
  });
  assert(areaIntelligence.response.ok, `/api/area-intelligence failed with ${areaIntelligence.response.status}`);
  assert(Number.isFinite(areaIntelligence.json?.analysis?.crimeData?.crimeScore), 'Area intelligence missing analysis payload');
  assert(Array.isArray(areaIntelligence.json?.nearby), 'Area intelligence missing nearby suggestions');
  assert(Array.isArray(areaIntelligence.json?.hotspotMap?.clusters), 'Area intelligence missing hotspot clusters');
  results.push({
    step: 'area-intelligence',
    ok: true,
    nearby: areaIntelligence.json.nearby.length,
    hotspotClusters: areaIntelligence.json?.hotspotMap?.clusterCount ?? 0,
  });

  const unifiedCompareAreas = await requestJson('/api/map-compare', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'area',
      areas: [
        {
          label: 'Smoke Patch',
          points: [
            { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
            { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
            { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude + 0.002 },
            { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude + 0.002 }
          ],
          monthCount: 6,
        },
        {
          label: 'Wider Patch',
          points: [
            { lat: analysis.json.postcodeData.latitude - 0.0035, lng: analysis.json.postcodeData.longitude - 0.0035 },
            { lat: analysis.json.postcodeData.latitude + 0.0035, lng: analysis.json.postcodeData.longitude - 0.0035 },
            { lat: analysis.json.postcodeData.latitude + 0.0035, lng: analysis.json.postcodeData.longitude + 0.0035 },
            { lat: analysis.json.postcodeData.latitude - 0.0035, lng: analysis.json.postcodeData.longitude + 0.0035 }
          ],
          monthCount: 6,
        }
      ],
    }),
  });
  assert(unifiedCompareAreas.response.ok, `/api/map-compare area failed with ${unifiedCompareAreas.response.status}`);
  assert(unifiedCompareAreas.json?.mode === 'area', 'Unified area compare returned unexpected mode');
  assert(Array.isArray(unifiedCompareAreas.json?.result?.results), 'Unified area compare missing results');
  results.push({
    step: 'map-compare-area',
    ok: true,
  });

  const unifiedAreaFeed = await requestJson('/api/map-feed', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'area',
      points: [
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude + 0.002 },
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude + 0.002 }
      ],
    }),
  });
  assert(unifiedAreaFeed.response.ok, `/api/map-feed area failed with ${unifiedAreaFeed.response.status}`);
  assert(unifiedAreaFeed.json?.mode === 'area', 'Unified area feed returned unexpected mode');
  assert(Array.isArray(unifiedAreaFeed.json?.result?.crimes), 'Unified area feed missing crimes array');
  results.push({
    step: 'map-feed-area',
    ok: true,
  });

  const unifiedArea = await requestJson('/api/map-intelligence', {
    method: 'POST',
    body: JSON.stringify({
      mode: 'area',
      label: 'Smoke Patch',
      points: [
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude - 0.002 },
        { lat: analysis.json.postcodeData.latitude + 0.002, lng: analysis.json.postcodeData.longitude + 0.002 },
        { lat: analysis.json.postcodeData.latitude - 0.002, lng: analysis.json.postcodeData.longitude + 0.002 }
      ],
      monthCount: 6,
      minimumClusterSize: 2,
      maxClusters: 4,
    }),
  });
  assert(unifiedArea.response.ok, `/api/map-intelligence area failed with ${unifiedArea.response.status}`);
  assert(unifiedArea.json?.mode === 'area', 'Unified area intelligence returned unexpected mode');
  assert(Number.isFinite(unifiedArea.json?.result?.analysis?.crimeData?.crimeScore), 'Unified area intelligence missing analysis payload');
  results.push({
    step: 'map-intelligence-area',
    ok: true,
  });

  const presetLabel = `Smoke ${Date.now()}`;
  const preset = await requestJson('/api/search-presets', {
    method: 'POST',
    body: JSON.stringify({
      type: 'postcode',
      label: presetLabel,
      payload: { postcode: POSTCODE },
    }),
  });
  assert(preset.response.ok, `/api/search-presets failed with ${preset.response.status}`);
  assert(preset.json?.id, 'Preset creation did not return an id');
  results.push({ step: 'create-preset', ok: true, presetId: preset.json.id });

  const runPreset = await requestJson('/api/run-search-preset', {
    method: 'POST',
    body: JSON.stringify({
      id: preset.json.id,
      mode: 'analyze',
    }),
  });
  assert(runPreset.response.ok, `/api/run-search-preset failed with ${runPreset.response.status}`);
  assert(runPreset.json?.result?.postcode || runPreset.json?.result?.label, 'Preset execution returned unexpected payload');
  results.push({ step: 'run-preset', ok: true });

  const pointPreset = await requestJson('/api/search-presets', {
    method: 'POST',
    body: JSON.stringify({
      type: 'point',
      label: `Smoke Point ${Date.now()}`,
      payload: {
        lat: analysis.json.postcodeData.latitude,
        lng: analysis.json.postcodeData.longitude,
        monthCount: 6,
      },
    }),
  });
  assert(pointPreset.response.ok, `/api/search-presets point failed with ${pointPreset.response.status}`);
  assert(pointPreset.json?.id, 'Point preset creation did not return an id');
  results.push({ step: 'create-point-preset', ok: true, presetId: pointPreset.json.id });

  const runPointPreset = await requestJson('/api/run-search-preset', {
    method: 'POST',
    body: JSON.stringify({
      id: pointPreset.json.id,
      mode: 'analyze',
    }),
  });
  assert(runPointPreset.response.ok, `/api/run-search-preset point analyze failed with ${runPointPreset.response.status}`);
  assert(Number.isFinite(runPointPreset.json?.result?.crimeData?.crimeScore), 'Point preset analyze returned unexpected payload');
  results.push({ step: 'run-point-preset', ok: true });

  const deletePreset = await requestJson(`/api/search-preset?id=${encodeURIComponent(preset.json.id)}`, {
    method: 'DELETE',
  });
  assert(deletePreset.response.ok, `/api/search-preset DELETE failed with ${deletePreset.response.status}`);
  results.push({ step: 'delete-preset', ok: true });

  const deletePointPreset = await requestJson(`/api/search-preset?id=${encodeURIComponent(pointPreset.json.id)}`, {
    method: 'DELETE',
  });
  assert(deletePointPreset.response.ok, `/api/search-preset point DELETE failed with ${deletePointPreset.response.status}`);
  results.push({ step: 'delete-point-preset', ok: true });

  if (ADMIN_API_KEY) {
    const adminExport = await requestJson('/api/admin/state-export');
    assert(adminExport.response.ok, `/api/admin/state-export failed with ${adminExport.response.status}`);
    assert(adminExport.json?.stores, 'Admin export missing stores payload');
    results.push({ step: 'admin-export', ok: true });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        postcode: POSTCODE,
        results,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl: BASE_URL,
        error: error.message || String(error),
      },
      null,
      2
    )
  );
  process.exitCode = 1;
});
