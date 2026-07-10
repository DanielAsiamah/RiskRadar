const BASE_URL = String(process.env.RISKRADAR_PREWARM_BASE_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const PREWARM_POSTCODES = String(process.env.RISKRADAR_PREWARM_POSTCODES || 'BR1 5NN,SW1A 1AA').split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .slice(0, 5);

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
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let json = null;
  if (text) {
    json = JSON.parse(text);
  }

  return { response, json };
}

async function main() {
  const warmed = [];

  const metadata = await requestJson('/api/filter-metadata');
  assert(metadata.response.ok, `Failed to prewarm /api/filter-metadata: ${metadata.response.status}`);
  warmed.push({ step: 'filter-metadata', ok: true });

  const healthBefore = await requestJson('/health');
  assert(healthBefore.response.ok, `Failed to read /health before prewarm: ${healthBefore.response.status}`);

  for (const postcode of PREWARM_POSTCODES) {
    const analysis = await requestJson('/api/analyze-postcode', {
      method: 'POST',
      body: JSON.stringify({ query: postcode }),
    });
    assert(analysis.response.ok, `Failed to prewarm analyze-postcode for ${postcode}: ${analysis.response.status}`);

    const monthly = await requestJson('/api/monthly-crime-series', {
      method: 'POST',
      body: JSON.stringify({ postcode, monthCount: 6 }),
    });
    assert(monthly.response.ok, `Failed to prewarm monthly-crime-series for ${postcode}: ${monthly.response.status}`);

    const hotspots = await requestJson('/api/map-hotspots', {
      method: 'POST',
      body: JSON.stringify({ postcode, radiusMeters: 900, minimumClusterSize: 3, maxClusters: 6 }),
    });
    assert(hotspots.response.ok, `Failed to prewarm map-hotspots for ${postcode}: ${hotspots.response.status}`);

    const intelligence = await requestJson('/api/map-intelligence', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'postcode',
        postcode,
        radiusMeters: 900,
        minimumClusterSize: 2,
        maxClusters: 4,
      }),
    });
    assert(intelligence.response.ok, `Failed to prewarm map-intelligence for ${postcode}: ${intelligence.response.status}`);

    const feed = await requestJson('/api/map-feed', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'postcode',
        postcode,
        radiusMeters: 900,
      }),
    });
    assert(feed.response.ok, `Failed to prewarm map-feed for ${postcode}: ${feed.response.status}`);

    const compare = await requestJson('/api/map-compare', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'postcode',
        postcodes: [postcode, PREWARM_POSTCODES[0]],
      }),
    });
    assert(compare.response.ok, `Failed to prewarm map-compare for ${postcode}: ${compare.response.status}`);

    warmed.push({
      step: 'postcode',
      ok: true,
      postcode,
      score: analysis.json?.crimeData?.crimeScore ?? null,
      trendMonths: Array.isArray(monthly.json?.monthly) ? monthly.json.monthly.length : 0,
      hotspotClusters: Array.isArray(hotspots.json?.clusters) ? hotspots.json.clusters.length : 0,
      unifiedHotspotClusters: intelligence.json?.result?.hotspotMap?.clusterCount ?? null,
      feedCrimes: Array.isArray(feed.json?.result?.crimes) ? feed.json.result.crimes.length : 0,
      compareResults: Array.isArray(compare.json?.result?.results) ? compare.json.result.results.length : 0,
    });

    const latitude = analysis.json?.postcodeData?.latitude;
    const longitude = analysis.json?.postcodeData?.longitude;

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      const pointIntelligence = await requestJson('/api/map-intelligence', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'point',
          lat: latitude,
          lng: longitude,
          monthCount: 6,
          radiusMeters: 900,
          minimumClusterSize: 2,
          maxClusters: 4,
        }),
      });
      assert(pointIntelligence.response.ok, `Failed to prewarm point map-intelligence for ${postcode}: ${pointIntelligence.response.status}`);

      const pointFeed = await requestJson('/api/map-feed', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'point',
          lat: latitude,
          lng: longitude,
          radiusMeters: 900,
        }),
      });
      assert(pointFeed.response.ok, `Failed to prewarm point map-feed for ${postcode}: ${pointFeed.response.status}`);

      const pointCompare = await requestJson('/api/map-compare', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'point',
          points: [
            { lat: latitude, lng: longitude, label: `${postcode} anchor`, monthCount: 6 },
            { lat: latitude + 0.003, lng: longitude + 0.003, label: `${postcode} nearby`, monthCount: 6 },
          ],
        }),
      });
      assert(pointCompare.response.ok, `Failed to prewarm point map-compare for ${postcode}: ${pointCompare.response.status}`);

      const areaPoints = [
        { lat: latitude - 0.002, lng: longitude - 0.002 },
        { lat: latitude + 0.002, lng: longitude - 0.002 },
        { lat: latitude + 0.002, lng: longitude + 0.002 },
        { lat: latitude - 0.002, lng: longitude + 0.002 },
      ];

      const areaIntelligence = await requestJson('/api/map-intelligence', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'area',
          label: `${postcode} patch`,
          points: areaPoints,
          monthCount: 6,
          minimumClusterSize: 2,
          maxClusters: 4,
        }),
      });
      assert(areaIntelligence.response.ok, `Failed to prewarm area map-intelligence for ${postcode}: ${areaIntelligence.response.status}`);

      const areaFeed = await requestJson('/api/map-feed', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'area',
          points: areaPoints,
        }),
      });
      assert(areaFeed.response.ok, `Failed to prewarm area map-feed for ${postcode}: ${areaFeed.response.status}`);

      const areaCompare = await requestJson('/api/map-compare', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'area',
          areas: [
            { label: `${postcode} patch`, points: areaPoints, monthCount: 6 },
            {
              label: `${postcode} wider patch`,
              points: [
                { lat: latitude - 0.0035, lng: longitude - 0.0035 },
                { lat: latitude + 0.0035, lng: longitude - 0.0035 },
                { lat: latitude + 0.0035, lng: longitude + 0.0035 },
                { lat: latitude - 0.0035, lng: longitude + 0.0035 },
              ],
              monthCount: 6,
            },
          ],
        }),
      });
      assert(areaCompare.response.ok, `Failed to prewarm area map-compare for ${postcode}: ${areaCompare.response.status}`);

      warmed.push({
        step: 'point-area',
        ok: true,
        postcode,
        pointHotspotClusters: pointIntelligence.json?.result?.hotspotMap?.clusterCount ?? null,
        pointFeedCrimes: Array.isArray(pointFeed.json?.result?.crimes) ? pointFeed.json.result.crimes.length : 0,
        pointCompareResults: Array.isArray(pointCompare.json?.result?.results) ? pointCompare.json.result.results.length : 0,
        areaHotspotClusters: areaIntelligence.json?.result?.hotspotMap?.clusterCount ?? null,
        areaFeedCrimes: Array.isArray(areaFeed.json?.result?.crimes) ? areaFeed.json.result.crimes.length : 0,
        areaCompareResults: Array.isArray(areaCompare.json?.result?.results) ? areaCompare.json.result.results.length : 0,
      });
    }
  }

  const healthAfter = await requestJson('/health');
  assert(healthAfter.response.ok, `Failed to read /health after prewarm: ${healthAfter.response.status}`);

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        postcodes: PREWARM_POSTCODES,
        cacheBefore: healthBefore.json?.analysisCache || null,
        cacheAfter: healthAfter.json?.analysisCache || null,
        warmed,
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
