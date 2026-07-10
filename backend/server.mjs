import http from 'node:http';

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function thresholdPoints(count, thresholds) {
  return thresholds.reduce((points, [minimum, award]) => (count >= minimum ? award : points), 0);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 32) {
        reject(new Error('Request body too large.'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    request.on('error', reject);
  });
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    const rawText = await response.text();
    let parsed = null;

    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const error = new Error(`Invalid JSON returned by upstream: ${url}`);
        error.statusCode = 502;
        throw error;
      }
    }

    if (!response.ok) {
      const upstreamMessage =
        parsed?.error ||
        parsed?.message ||
        `${response.status} ${response.statusText}`.trim();
      const error = new Error(`Upstream request failed: ${upstreamMessage}`);
      error.statusCode = response.status >= 500 ? 502 : response.status;
      throw error;
    }

    return parsed;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(`Upstream request timed out after ${timeoutMs}ms.`);
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function formatMonthDisplay(monthValue) {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return 'Recent data';
  }

  const date = new Date(`${monthValue}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatShortMonthDisplay(monthValue) {
  if (!monthValue || !/^\d{4}-\d{2}$/.test(monthValue)) {
    return 'Recent';
  }

  const date = new Date(`${monthValue}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function normalizeQuery(query) {
  return String(query || '').trim();
}

function isLikelyUkPostcode(query) {
  return /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(query);
}

function titleCaseWords(value) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function humanizeCategory(value) {
  return titleCaseWords(String(value || 'other-crime').replace(/-/g, ' '));
}

function getCategoryCount(categories, key) {
  return categories.find((category) => category.category === key)?.count || 0;
}

function getDirection(currentValue, previousValue) {
  if (!previousValue && !currentValue) {
    return 'stable';
  }

  if (!previousValue) {
    return currentValue > 0 ? 'rising' : 'stable';
  }

  const deltaRatio = (currentValue - previousValue) / previousValue;
  if (deltaRatio >= 0.12) return 'rising';
  if (deltaRatio <= -0.12) return 'cooling';
  return 'stable';
}

function percentChange(currentValue, previousValue) {
  if (!previousValue) {
    return currentValue > 0 ? 100 : 0;
  }

  return Math.round(((currentValue - previousValue) / previousValue) * 100);
}

function getPastMonthKeys(count, offsetFromCurrent = 2) {
  const months = [];
  const now = new Date();

  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offsetFromCurrent - index, 1));
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }

  return months;
}

function deriveDistrictFromAddress(address = {}) {
  return (
    address.city ||
    address.town ||
    address.county ||
    address.state_district ||
    address.municipality ||
    address.village ||
    address.suburb ||
    null
  );
}

async function resolveViaPostcodesIo(query) {
  const encoded = encodeURIComponent(query.replace(/\s+/g, ''));
  const exactUrl = `https://api.postcodes.io/postcodes/${encoded}`;

  try {
    const exactMatch = await fetchJson(exactUrl, {}, 12000);

    if (exactMatch?.result) {
      const { result } = exactMatch;
      return {
        postcode: result.postcode,
        latitude: result.latitude,
        longitude: result.longitude,
        admin_district: result.admin_district || 'Unknown district',
        source: 'postcodes.io',
      };
    }
  } catch (error) {
    if (error.statusCode && error.statusCode !== 404) {
      throw error;
    }
  }

  const searchUrl = `https://api.postcodes.io/postcodes?q=${encodeURIComponent(query)}`;
  const searchMatch = await fetchJson(searchUrl, {}, 12000);
  const first = searchMatch?.result?.[0];

  if (!first) {
    return null;
  }

  return {
    postcode: first.postcode,
    latitude: first.latitude,
    longitude: first.longitude,
    admin_district: first.admin_district || titleCaseWords(query),
    source: 'postcodes.io',
  };
}

async function resolveViaNominatim(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`;
  const results = await fetchJson(
    url,
    {
      headers: {
        'User-Agent': 'RiskRadarBackend/1.0 (Expo local API)',
        Accept: 'application/json',
      },
    },
    15000
  );

  const first = results?.[0];

  if (!first) {
    return null;
  }

  const district = deriveDistrictFromAddress(first.address) || titleCaseWords(query);
  const postcode =
    first.address?.postcode ||
    first.name ||
    district ||
    titleCaseWords(query);

  return {
    postcode,
    latitude: Number(first.lat),
    longitude: Number(first.lon),
    admin_district: district,
    source: 'nominatim',
  };
}

async function fetchNearbyPostcodes(latitude, longitude, limit = 5) {
  const url = `https://api.postcodes.io/postcodes?lon=${encodeURIComponent(longitude)}&lat=${encodeURIComponent(latitude)}&limit=${encodeURIComponent(limit)}`;
  const response = await fetchJson(url, {}, 12000).catch((error) => {
    if (error.statusCode === 404) {
      return { result: [] };
    }
    throw error;
  });

  const candidates = Array.isArray(response?.result) ? response.result : [];

  return candidates
    .filter((entry) => entry?.postcode)
    .map((entry) => ({
      postcode: entry.postcode,
      admin_district: entry.admin_district || 'Nearby area',
    }))
    .slice(0, limit);
}

async function resolveLocation(query) {
  const normalized = normalizeQuery(query);

  if (!normalized) {
    const error = new Error('A postcode, ZIP code, city, or place is required.');
    error.statusCode = 400;
    throw error;
  }

  if (isLikelyUkPostcode(normalized)) {
    const postcodeMatch = await resolveViaPostcodesIo(normalized);
    if (postcodeMatch) {
      return postcodeMatch;
    }
  }

  const postcodeSearchMatch = await resolveViaPostcodesIo(normalized).catch((error) => {
    if (error.statusCode && error.statusCode < 500) {
      return null;
    }
    throw error;
  });

  if (postcodeSearchMatch) {
    return postcodeSearchMatch;
  }

  const nominatimMatch = await resolveViaNominatim(normalized);

  if (nominatimMatch) {
    return nominatimMatch;
  }

  const error = new Error('No matching location was found for that search.');
  error.statusCode = 404;
  throw error;
}

function summarizeCrimeCategories(crimes) {
  const totals = new Map();

  for (const crime of crimes) {
    const key = String(crime.category || 'other-crime');
    totals.set(key, (totals.get(key) || 0) + 1);
  }

  return [...totals.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);
}

function scoreCrime(categories, totalCrimes) {
  if (!totalCrimes) {
    return 4;
  }

  const violentCount = getCategoryCount(categories, 'violent-crime') || getCategoryCount(categories, 'violence-and-sexual-offences');
  const robberyCount = getCategoryCount(categories, 'robbery');
  const weaponsCount = getCategoryCount(categories, 'possession-of-weapons');
  const burglaryCount = getCategoryCount(categories, 'burglary');
  const antiSocialCount = getCategoryCount(categories, 'anti-social-behaviour');
  const vehicleCrimeCount = getCategoryCount(categories, 'vehicle-crime');
  const drugsCount = getCategoryCount(categories, 'drugs');
  const theftCount =
    getCategoryCount(categories, 'other-theft') +
    getCategoryCount(categories, 'theft') +
    getCategoryCount(categories, 'theft-from-the-person') +
    getCategoryCount(categories, 'shoplifting') +
    getCategoryCount(categories, 'bicycle-theft');
  const topCategoryShare = (categories[0]?.count || 0) / totalCrimes;

  // Threshold scoring keeps high scores rare and rewards specific high-harm patterns
  // rather than letting dense city centres climb mainly because they are busy.
  const robberyPoints = thresholdPoints(robberyCount, [
    [5, 1],
    [15, 2],
    [30, 3],
    [50, 5],
  ]);
  const weaponsPoints = thresholdPoints(weaponsCount, [
    [2, 1],
    [5, 2],
    [10, 3],
  ]);
  const violentPoints = thresholdPoints(violentCount, [
    [40, 1],
    [90, 2],
    [160, 3],
    [260, 4],
  ]);
  const burglaryPoints = thresholdPoints(burglaryCount, [
    [15, 1],
    [35, 2],
    [70, 3],
  ]);
  const antiSocialPoints = thresholdPoints(antiSocialCount, [
    [90, 1],
    [180, 2],
    [320, 3],
  ]);
  const vehiclePoints = thresholdPoints(vehicleCrimeCount, [
    [25, 1],
    [60, 2],
    [110, 3],
  ]);
  const drugsPoints = thresholdPoints(drugsCount, [
    [10, 1],
    [25, 2],
    [50, 3],
  ]);
  const theftPoints = thresholdPoints(theftCount, [
    [150, 1],
    [350, 2],
    [650, 3],
  ]);
  const totalVolumePoints = thresholdPoints(totalCrimes, [
    [300, 1],
    [700, 2],
    [1400, 3],
    [2600, 4],
  ]);
  const concentrationPoints = topCategoryShare >= 0.4 ? 2 : topCategoryShare >= 0.3 ? 1 : 0;

  const score =
    4 +
    robberyPoints +
    weaponsPoints +
    violentPoints +
    burglaryPoints +
    antiSocialPoints +
    vehiclePoints +
    drugsPoints +
    theftPoints +
    totalVolumePoints +
    concentrationPoints;

  return clamp(score, 1, 60);
}

function getSafetyLevel(score) {
  if (score >= 55) return 'SEVERE';
  if (score >= 45) return 'HIGH';
  if (score >= 30) return 'ELEVATED';
  if (score >= 18) return 'MODERATE';
  if (score >= 8) return 'NORMAL URBAN CAUTION';
  return 'LOW RISK';
}

function buildRiskSignals({ district, totalCrimes, categories }) {
  if (!totalCrimes) {
    return [
      `No recent street-level incidents were returned for the selected point in ${district}.`,
      'That can indicate a quieter area or limited public coverage for the exact coordinates used.',
      'Use normal awareness and verify with current local advice before travel.',
    ];
  }

  const signals = [];
  const topCategories = categories.slice(0, 3);

  if (topCategories[0]) {
    signals.push(
      `${topCategories[0].count} reported ${humanizeCategory(topCategories[0].category).toLowerCase()} incidents were found in the latest street-level dataset.`
    );
  }

  if (topCategories[1]) {
    signals.push(
      `${humanizeCategory(topCategories[1].category).toLowerCase()} is also a visible pattern around ${district}.`
    );
  }

  if (totalCrimes >= 25) {
    signals.push('Incident volume is high enough to suggest a busier urban environment with elevated background risk.');
  } else if (totalCrimes >= 10) {
    signals.push('Incident volume is moderate, so route planning and time-of-day awareness still matter.');
  } else {
    signals.push('Incident volume is relatively light, but isolated events still appear in the local feed.');
  }

  return signals;
}

function buildScoreFactors({ district, totalCrimes, categories, crimeScore }) {
  const violentCount = getCategoryCount(categories, 'violent-crime') || getCategoryCount(categories, 'violence-and-sexual-offences');
  const antiSocialCount = getCategoryCount(categories, 'anti-social-behaviour');
  const robberyCount = getCategoryCount(categories, 'robbery');
  const theftCount = getCategoryCount(categories, 'other-theft') + getCategoryCount(categories, 'theft') + getCategoryCount(categories, 'theft-from-the-person');
  const topCategory = categories[0];
  const factors = [];

  if (violentCount > 0) {
    factors.push({
      label: 'Violent crime mix',
      impact: violentCount / Math.max(totalCrimes, 1) > 0.18 ? 'up' : 'neutral',
      detail: `${violentCount} violent incidents are part of the current street-level mix around ${district}.`,
    });
  }

  if (robberyCount > 0) {
    factors.push({
      label: 'Robbery and weapons pressure',
      impact: robberyCount >= 15 || getCategoryCount(categories, 'possession-of-weapons') >= 5 ? 'up' : 'neutral',
      detail: `${robberyCount} robbery incidents were recorded. In the current model, robbery only starts adding serious points once it crosses harder thresholds.`,
    });
  }

  if (theftCount > 0) {
    factors.push({
      label: 'Theft-driven activity',
      impact: 'neutral',
      detail: `${theftCount} theft-related incidents suggest a busy footfall environment rather than danger from one category alone.`,
    });
  }

  if (antiSocialCount > 0) {
    factors.push({
      label: 'Area disorder signal',
      impact: antiSocialCount >= 90 ? 'up' : 'neutral',
      detail: `${antiSocialCount} anti-social behaviour reports indicate visible street disorder, but they now contribute less unless the count is very high.`,
    });
  }

  if (topCategory) {
    factors.push({
      label: 'Concentrated pattern',
      impact: topCategory.count / Math.max(totalCrimes, 1) > 0.33 ? 'up' : 'neutral',
      detail: `${humanizeCategory(topCategory.category)} is the largest category right now, accounting for ${topCategory.count} of the recorded incidents.`,
    });
  }

  if (totalCrimes <= 12) {
    factors.push({
      label: 'Lower reporting volume',
      impact: 'down',
      detail: `Only ${totalCrimes} incidents were found inside the postcode-level search radius for the latest month, which keeps the score from climbing too aggressively.`,
    });
  } else if (crimeScore < 45) {
    factors.push({
      label: 'Moderated overall risk',
      impact: 'down',
      detail: 'The final score is moderated because the postcode-level incident mix is not dominated by the highest-severity categories.',
    });
  }

  return factors.slice(0, 4);
}

function buildAreaContext({ district, totalCrimes, categories }) {
  const shopliftingCount = getCategoryCount(categories, 'shoplifting');
  const theftCount = getCategoryCount(categories, 'other-theft') + getCategoryCount(categories, 'theft-from-the-person');
  const antiSocialCount = getCategoryCount(categories, 'anti-social-behaviour');
  const vehicleCrimeCount = getCategoryCount(categories, 'vehicle-crime');

  if (shopliftingCount + theftCount >= Math.max(20, totalCrimes * 0.28)) {
    return `${district} behaves like a busy commercial or commuter zone, where retail activity and passing footfall tend to lift opportunistic crime volumes.`;
  }

  if (antiSocialCount + vehicleCrimeCount >= Math.max(12, totalCrimes * 0.22)) {
    return `${district} reads more like a mixed residential area with local disorder and vehicle-related pressure rather than pure city-centre crowding.`;
  }

  if (totalCrimes >= 120) {
    return `${district} looks like a high-activity urban patch with steady movement through the area, but the risk is spread across several categories rather than one extreme pattern.`;
  }

  return `${district} appears closer to a quieter residential or mixed-use area, with risk shaped by a smaller number of repeating local issues.`;
}

function buildPremiumInsights({ district, trendData, areaContext }) {
  return [
    {
      id: 'trend',
      title: 'Crime Trend Graph',
      description: trendData.summary,
      badge: trendData.direction === 'rising' ? 'Rising' : trendData.direction === 'cooling' ? 'Cooling' : 'Stable',
    },
    {
      id: 'category-trend',
      title: 'Category Trend Graph',
      description: `Track whether violent crime, anti-social behaviour, and robbery are trending up or down over the last ${trendData.monthly.length} months.`,
      badge: 'Live',
    },
    {
      id: 'area-context',
      title: 'Area Busyness Proxy',
      description: areaContext,
      badge: 'Context',
    },
    {
      id: 'hotspot-map',
      title: 'Hotspot Map',
      description: `Unlock a hotspot view to see where incident clusters are concentrated around ${district}, not just the single postcode summary.`,
      badge: 'Map',
    },
  ];
}

function buildAiAnalysis({ district, safetyLevel, totalCrimes, topCategories, scoreFactors, areaContext, trendData }) {
  const primaryCategory = humanizeCategory(topCategories[0]?.category || 'reported incidents').toLowerCase();
  const scoreStory = scoreFactors.map((factor) => factor.detail);

  return {
    summary: `${district} currently scores ${safetyLevel.toLowerCase()} because of the latest incident volume, the severity mix of recorded offences, and the way those incidents are concentrated around the area.`,
    whatToAvoid: [
      `Poorly lit streets around ${district} late at night.`,
      `Areas where ${primaryCategory} has been repeatedly logged.`,
      'Leaving valuables visible in transit or parked vehicles.',
    ],
    safetyTips: [
      'Stay on well-used routes and keep phone battery available for navigation.',
      'Check the latest local police and council notices before visiting unfamiliar streets.',
      totalCrimes >= 20 ? 'Avoid isolated shortcuts after dark when possible.' : 'Use normal urban awareness and trust active, busy routes.',
    ],
    localVibe: totalCrimes >= 20
      ? 'Busy urban environment with enough incident density to justify extra caution.'
      : 'Mixed local environment with manageable but still real day-to-day safety considerations.',
    scoreStory,
    areaContext: `${areaContext} ${trendData.summary}`,
  };
}

async function fetchCrimeData(latitude, longitude) {
  const crimesUrl = `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`;
  const crimes = await fetchJson(crimesUrl, {}, 18000).catch((error) => {
    if (error.statusCode === 404) {
      return [];
    }
    throw error;
  });

  const searchRadiusMeters = 400;
  const safeCrimes = Array.isArray(crimes) ? crimes : [];
  const filteredCrimes = safeCrimes.filter((crime) => {
    const incidentLat = Number(crime?.location?.latitude);
    const incidentLon = Number(crime?.location?.longitude);

    if (!Number.isFinite(incidentLat) || !Number.isFinite(incidentLon)) {
      return false;
    }

    return distanceInMeters(latitude, longitude, incidentLat, incidentLon) <= searchRadiusMeters;
  });

  const categories = summarizeCrimeCategories(filteredCrimes);
  const totalCrimes = filteredCrimes.length;
  const month = filteredCrimes?.[0]?.month || safeCrimes?.[0]?.month || null;
  const crimeScore = scoreCrime(categories, totalCrimes);

  return {
    totalCrimes,
    crimeScore,
    safetyLevel: getSafetyLevel(crimeScore),
    month: month || '',
    monthDisplay: formatMonthDisplay(month),
    categories,
    capExplanation:
      `Live score is now filtered to incidents within roughly ${searchRadiusMeters} metres of the postcode point, then scored with hard category thresholds so the result reflects the postcode area rather than a whole city.`,
  };
}

async function fetchCrimeHistory(latitude, longitude, monthCount = 6) {
  const monthKeys = getPastMonthKeys(monthCount);
  let monthly;

  try {
    monthly = await Promise.all(
      monthKeys.map(async (monthKey) => {
        const crimesUrl = `https://data.police.uk/api/crimes-street/all-crime?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}&date=${monthKey}`;
        const crimes = await fetchJson(crimesUrl, {}, 18000).catch((error) => {
          if (error.statusCode === 404) {
            return [];
          }
          throw error;
        });

        const safeCrimes = Array.isArray(crimes) ? crimes : [];

        return {
          month: monthKey,
          monthDisplay: formatShortMonthDisplay(monthKey),
          totalCrimes: safeCrimes.length,
          violentCrimes: safeCrimes.filter((crime) => ['violent-crime', 'violence-and-sexual-offences'].includes(crime.category)).length,
          antiSocialCrimes: safeCrimes.filter((crime) => crime.category === 'anti-social-behaviour').length,
          robberyCrimes: safeCrimes.filter((crime) => crime.category === 'robbery').length,
        };
      })
    );
  } catch (error) {
    if (error.statusCode === 429) {
      return {
        monthly: monthKeys.map((monthKey) => ({
          month: monthKey,
          monthDisplay: formatShortMonthDisplay(monthKey),
          totalCrimes: 0,
          violentCrimes: 0,
          antiSocialCrimes: 0,
          robberyCrimes: 0,
        })),
        direction: 'stable',
        changePercent: 0,
        categoryDirection: {
          violentCrimes: 'stable',
          antiSocialCrimes: 'stable',
          robberyCrimes: 'stable',
        },
        summary: 'Monthly trend data is temporarily rate-limited by the police feed, but PRO unlocks the historical graph as soon as those snapshots are available.',
      };
    }

    throw error;
  }

  const latest = monthly[monthly.length - 1] || { totalCrimes: 0, violentCrimes: 0, antiSocialCrimes: 0, robberyCrimes: 0 };
  const comparison = monthly[Math.max(0, monthly.length - 4)] || monthly[0] || latest;
  const direction = getDirection(latest.totalCrimes, comparison.totalCrimes);
  const overallChangePercent = percentChange(latest.totalCrimes, comparison.totalCrimes);
  const violentDirection = getDirection(latest.violentCrimes, comparison.violentCrimes);
  const antiSocialDirection = getDirection(latest.antiSocialCrimes, comparison.antiSocialCrimes);
  const robberyDirection = getDirection(latest.robberyCrimes, comparison.robberyCrimes);

  let summary = `Crime volume is ${direction} versus ${comparison.monthDisplay}, with a ${Math.abs(overallChangePercent)}% change across the latest police monthly snapshots.`;
  if (violentDirection === 'rising') {
    summary += ' Violent incidents are also trending upward.';
  } else if (violentDirection === 'cooling') {
    summary += ' Violent incidents have been easing recently.';
  } else {
    summary += ' Violent incidents are broadly stable.';
  }

  return {
    monthly,
    direction,
    changePercent: overallChangePercent,
    categoryDirection: {
      violentCrimes: violentDirection,
      antiSocialCrimes: antiSocialDirection,
      robberyCrimes: robberyDirection,
    },
    summary,
  };
}

async function analyzeLocation(query) {
  const location = await resolveLocation(query);
  const crimeData = await fetchCrimeData(location.latitude, location.longitude);
  const trendData = await fetchCrimeHistory(location.latitude, location.longitude);
  const scoreFactors = buildScoreFactors({
    district: location.admin_district,
    totalCrimes: crimeData.totalCrimes,
    categories: crimeData.categories,
    crimeScore: crimeData.crimeScore,
  });
  const areaContext = buildAreaContext({
    district: location.admin_district,
    totalCrimes: crimeData.totalCrimes,
    categories: crimeData.categories,
  });
  const riskSignals = buildRiskSignals({
    district: location.admin_district,
    totalCrimes: crimeData.totalCrimes,
    categories: crimeData.categories,
  });

  return {
    postcode: location.postcode,
    crimeData: {
      ...crimeData,
      riskSignals,
      scoreFactors,
    },
    postcodeData: {
      admin_district: location.admin_district,
      longitude: location.longitude,
      latitude: location.latitude,
      postcode: location.postcode,
    },
    aiAnalysis: buildAiAnalysis({
      district: location.admin_district,
      safetyLevel: crimeData.safetyLevel,
      totalCrimes: crimeData.totalCrimes,
      topCategories: crimeData.categories,
      scoreFactors,
      areaContext,
      trendData,
    }),
    trendData,
    premiumInsights: buildPremiumInsights({
      district: location.admin_district,
      trendData,
      areaContext,
    }),
    newsLink: `https://news.google.com/search?q=${encodeURIComponent(`${location.admin_district} police OR crime`)}`,
  };
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 404, { error: 'Not found.' });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    });
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/health') {
    sendJson(response, 200, {
      ok: true,
      service: 'riskradar-api',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/analyze-postcode') {
    try {
      const body = await readJsonBody(request);
      const query = body.postcode ?? body.query ?? '';
      const result = await analyzeLocation(query);
      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/location-suggestions') {
    try {
      const latitude = Number(url.searchParams.get('lat'));
      const longitude = Number(url.searchParams.get('lng'));

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        const error = new Error('Valid lat and lng query parameters are required.');
        error.statusCode = 400;
        throw error;
      }

      const nearby = await fetchNearbyPostcodes(latitude, longitude);
      sendJson(response, 200, {
        nearby,
      });
    } catch (error) {
      const statusCode = Number(error.statusCode) || 500;
      sendJson(response, statusCode, {
        error: error.message || 'Unexpected backend error.',
      });
    }
    return;
  }

  sendJson(response, 404, { error: 'Not found.' });
});

server.listen(PORT, HOST, () => {
  console.log(`RiskRadar API listening on http://${HOST}:${PORT}`);
});
