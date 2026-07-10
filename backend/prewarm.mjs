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

    warmed.push({
      step: 'postcode',
      ok: true,
      postcode,
      score: analysis.json?.crimeData?.crimeScore ?? null,
      trendMonths: Array.isArray(monthly.json?.monthly) ? monthly.json.monthly.length : 0,
      hotspotClusters: Array.isArray(hotspots.json?.clusters) ? hotspots.json.clusters.length : 0,
    });
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl: BASE_URL,
        postcodes: PREWARM_POSTCODES,
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
