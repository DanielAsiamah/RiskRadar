import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_MONTH_FILE_PATTERN = /(^|[\\/])(\d{4}-\d{2})[^\\/]*street[^\\/]*\.csv$/i;
const MONTH_PATTERN = /\b(\d{4}-\d{2})\b/;
const POINT_QUERY_RADIUS_METERS = 1700;

const PRETTY_TO_CATEGORY = new Map([
  ['anti-social behaviour', 'anti-social-behaviour'],
  ['bicycle theft', 'bicycle-theft'],
  ['burglary', 'burglary'],
  ['criminal damage and arson', 'criminal-damage-arson'],
  ['drugs', 'drugs'],
  ['other crime', 'other-crime'],
  ['other theft', 'other-theft'],
  ['possession of weapons', 'possession-of-weapons'],
  ['public order', 'public-order'],
  ['robbery', 'robbery'],
  ['shoplifting', 'shoplifting'],
  ['theft from the person', 'theft-from-the-person'],
  ['vehicle crime', 'vehicle-crime'],
  ['violent crime', 'violent-crime'],
  ['violence and sexual offences', 'violent-crime'],
]);

function normalizeMonth(month) {
  const value = String(month || '').trim();
  return /^\d{4}-\d{2}$/.test(value) ? value : '';
}

function normalizeCategoryLabel(label) {
  return String(label || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function normalizeCategory(label) {
  return PRETTY_TO_CATEGORY.get(normalizeCategoryLabel(label)) || 'other-crime';
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += character;
  }

  values.push(current);
  return values;
}

function parseCsv(content) {
  const lines = String(content || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return [];
  }

  const header = parseCsvLine(lines[0]).map((value) => value.trim());
  const rows = [];

  for (const line of lines.slice(1)) {
    const values = parseCsvLine(line);
    const row = {};

    header.forEach((column, index) => {
      row[column] = values[index] ?? '';
    });

    rows.push(row);
  }

  return rows;
}

function toCrimeRecord(row, fallbackMonth) {
  const latitude = toNumber(row.Latitude ?? row.latitude);
  const longitude = toNumber(row.Longitude ?? row.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const month = normalizeMonth(row.Month ?? row.month) || fallbackMonth;
  const category = normalizeCategory(row['Crime type'] ?? row.crime_type ?? row.category);
  const street = String(row.Location ?? row.location ?? '').trim() || 'Unknown street';
  const outcome = String(row['Last outcome category'] ?? row.outcome ?? '').trim();

  return {
    category,
    month,
    persistent_id: String(row['Crime ID'] ?? row.crime_id ?? '').trim(),
    outcome_status: outcome ? { category: outcome } : null,
    location: {
      latitude: String(latitude),
      longitude: String(longitude),
      street: { name: street },
    },
  };
}

function distanceInMeters(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function pointInPolygon(latitude, longitude, polygon) {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].latitude;
    const yi = polygon[i].longitude;
    const xj = polygon[j].latitude;
    const yj = polygon[j].longitude;

    const intersect = ((yi > longitude) !== (yj > longitude))
      && (latitude < ((xj - xi) * (longitude - yi)) / ((yj - yi) || Number.EPSILON) + xi);

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

function percentile(sortedValues, quantile) {
  if (!sortedValues.length) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0];
  }

  const index = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower];
  }

  const weight = index - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

export function createCrimeFileSource(options = {}) {
  const rootDir = path.resolve(String(options.rootDir || path.join(process.cwd(), 'backend', 'data', 'police')));
  const fileCache = new Map();
  const summaryCache = new Map();
  let fileIndexCache = null;

  function buildFileIndex() {
    if (!fs.existsSync(rootDir)) {
      return [];
    }

    const discovered = [];
    const stack = [rootDir];

    while (stack.length) {
      const current = stack.pop();
      const entries = fs.readdirSync(current, { withFileTypes: true });

      for (const entry of entries) {
        const nextPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(nextPath);
          continue;
        }

        if (!entry.isFile()) {
          continue;
        }

        const monthMatch = nextPath.match(DEFAULT_MONTH_FILE_PATTERN) || nextPath.match(MONTH_PATTERN);
        if (!monthMatch) {
          continue;
        }

        const month = monthMatch[2] || monthMatch[1];
        if (!normalizeMonth(month) || !/street/i.test(entry.name)) {
          continue;
        }

        discovered.push({ month, filePath: nextPath });
      }
    }

    return discovered.sort((left, right) => right.month.localeCompare(left.month));
  }

  function getFileIndex() {
    if (!fileIndexCache) {
      fileIndexCache = buildFileIndex();
    }
    return fileIndexCache;
  }

  function listAvailableMonths() {
    return [...new Set(getFileIndex().map((entry) => entry.month))];
  }

  function readManifest() {
    const manifestPath = path.join(rootDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      return null;
    }

    try {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      return {
        error: 'manifest.json could not be parsed.',
        manifestPath,
      };
    }
  }

  function readMonth(month) {
    const normalizedMonth = normalizeMonth(month);
    if (!normalizedMonth) {
      return [];
    }

    if (fileCache.has(normalizedMonth)) {
      return fileCache.get(normalizedMonth);
    }

    const monthFiles = getFileIndex().filter((entry) => entry.month === normalizedMonth);
    const records = [];

    for (const file of monthFiles) {
      const parsedRows = parseCsv(fs.readFileSync(file.filePath, 'utf8'));
      for (const row of parsedRows) {
        const record = toCrimeRecord(row, normalizedMonth);
        if (record) {
          records.push(record);
        }
      }
    }

    fileCache.set(normalizedMonth, records);
    return records;
  }

  function summarizeDataset(options = {}) {
    const requestedMonth = normalizeMonth(options.month);
    const monthLimit = Math.max(1, Math.min(24, Number(options.monthLimit) || 6));
    const selectedMonths = requestedMonth
      ? [requestedMonth]
      : listAvailableMonths().slice(0, monthLimit);
    const cacheKey = JSON.stringify({
      month: requestedMonth || '',
      monthLimit,
      selectedMonths,
    });

    if (summaryCache.has(cacheKey)) {
      return summaryCache.get(cacheKey);
    }

    const monthSummaries = [];
    const categoryTotals = new Map();
    const uniqueLocations = new Set();
    let totalCrimes = 0;
    let minLatitude = Number.POSITIVE_INFINITY;
    let maxLatitude = Number.NEGATIVE_INFINITY;
    let minLongitude = Number.POSITIVE_INFINITY;
    let maxLongitude = Number.NEGATIVE_INFINITY;

    for (const month of selectedMonths) {
      const crimes = readMonth(month);
      const monthCategoryTotals = new Map();

      for (const crime of crimes) {
        totalCrimes += 1;
        const category = String(crime.category || 'other-crime');
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
        monthCategoryTotals.set(category, (monthCategoryTotals.get(category) || 0) + 1);

        const latitude = Number(crime.location.latitude);
        const longitude = Number(crime.location.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          minLatitude = Math.min(minLatitude, latitude);
          maxLatitude = Math.max(maxLatitude, latitude);
          minLongitude = Math.min(minLongitude, longitude);
          maxLongitude = Math.max(maxLongitude, longitude);
          uniqueLocations.add(`${latitude.toFixed(5)}:${longitude.toFixed(5)}`);
        }
      }

      monthSummaries.push({
        month,
        totalCrimes: crimes.length,
        uniqueApproxLocations: new Set(
          crimes.map((crime) => {
            const latitude = Number(crime.location.latitude);
            const longitude = Number(crime.location.longitude);
            return Number.isFinite(latitude) && Number.isFinite(longitude)
              ? `${latitude.toFixed(5)}:${longitude.toFixed(5)}`
              : 'unknown';
          })
        ).size,
        topCategories: [...monthCategoryTotals.entries()]
          .map(([category, count]) => ({ category, count }))
          .sort((left, right) => right.count - left.count)
          .slice(0, 5),
      });
    }

    const summary = {
      rootDir,
      requestedMonth: requestedMonth || null,
      monthLimit,
      monthsAnalyzed: monthSummaries.length,
      totalCrimes,
      uniqueApproxLocations: uniqueLocations.size,
      bounds: totalCrimes
        ? {
            minLatitude,
            maxLatitude,
            minLongitude,
            maxLongitude,
          }
        : null,
      categories: [...categoryTotals.entries()]
        .map(([category, count]) => ({ category, count }))
        .sort((left, right) => right.count - left.count),
      months: monthSummaries,
    };

    summaryCache.set(cacheKey, summary);
    return summary;
  }

  function summarizeCalibration(options = {}) {
    const requestedMonth = normalizeMonth(options.month);
    const monthLimit = Math.max(1, Math.min(24, Number(options.monthLimit) || 6));
    const selectedMonths = requestedMonth
      ? [requestedMonth]
      : listAvailableMonths().slice(0, monthLimit);
    const cacheKey = JSON.stringify({
      type: 'calibration',
      month: requestedMonth || '',
      monthLimit,
      selectedMonths,
    });

    if (summaryCache.has(cacheKey)) {
      return summaryCache.get(cacheKey);
    }

    const locationTotals = [];
    const categoryTotals = new Map();
    const locationMonthSummaries = [];

    for (const month of selectedMonths) {
      const crimes = readMonth(month);
      const monthLocations = new Map();

      for (const crime of crimes) {
        const latitude = Number(crime.location.latitude);
        const longitude = Number(crime.location.longitude);
        const category = String(crime.category || 'other-crime');
        const locationKey = Number.isFinite(latitude) && Number.isFinite(longitude)
          ? `${latitude.toFixed(5)}:${longitude.toFixed(5)}`
          : `unknown:${category}`;

        const entry = monthLocations.get(locationKey) || {
          count: 0,
          latitude,
          longitude,
          categories: new Map(),
        };

        entry.count += 1;
        entry.categories.set(category, (entry.categories.get(category) || 0) + 1);
        monthLocations.set(locationKey, entry);
        categoryTotals.set(category, (categoryTotals.get(category) || 0) + 1);
      }

      const monthCounts = [...monthLocations.values()].map((entry) => entry.count).sort((left, right) => left - right);
      const topLocations = [...monthLocations.values()]
        .sort((left, right) => right.count - left.count)
        .slice(0, 5)
        .map((entry) => ({
          latitude: entry.latitude,
          longitude: entry.longitude,
          count: entry.count,
          topCategories: [...entry.categories.entries()]
            .map(([category, count]) => ({ category, count }))
            .sort((left, right) => right.count - left.count)
            .slice(0, 3),
        }));

      for (const count of monthCounts) {
        locationTotals.push(count);
      }

      locationMonthSummaries.push({
        month,
        exactLocationCount: monthLocations.size,
        incidentCount: crimes.length,
        distribution: {
          min: monthCounts[0] || 0,
          p50: Math.round(percentile(monthCounts, 0.5) * 100) / 100,
          p75: Math.round(percentile(monthCounts, 0.75) * 100) / 100,
          p90: Math.round(percentile(monthCounts, 0.9) * 100) / 100,
          p95: Math.round(percentile(monthCounts, 0.95) * 100) / 100,
          max: monthCounts[monthCounts.length - 1] || 0,
        },
        topLocations,
      });
    }

    const sortedTotals = [...locationTotals].sort((left, right) => left - right);
    const sortedCategories = [...categoryTotals.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((left, right) => right.count - left.count);

    const calibration = {
      rootDir,
      requestedMonth: requestedMonth || null,
      monthLimit,
      monthsAnalyzed: selectedMonths.length,
      sampledExactLocations: sortedTotals.length,
      totalIncidents: sortedTotals.reduce((sum, value) => sum + value, 0),
      locationIncidentDistribution: {
        min: sortedTotals[0] || 0,
        p50: Math.round(percentile(sortedTotals, 0.5) * 100) / 100,
        p75: Math.round(percentile(sortedTotals, 0.75) * 100) / 100,
        p90: Math.round(percentile(sortedTotals, 0.9) * 100) / 100,
        p95: Math.round(percentile(sortedTotals, 0.95) * 100) / 100,
        p99: Math.round(percentile(sortedTotals, 0.99) * 100) / 100,
        max: sortedTotals[sortedTotals.length - 1] || 0,
      },
      topCategories: sortedCategories.slice(0, 10),
      months: locationMonthSummaries,
      scoringHint: sortedTotals.length
        ? `Exact-location incident counts sit around p50=${Math.round(percentile(sortedTotals, 0.5) * 100) / 100}, p90=${Math.round(percentile(sortedTotals, 0.9) * 100) / 100}, and p95=${Math.round(percentile(sortedTotals, 0.95) * 100) / 100} across the loaded snapshot set.`
        : 'No local snapshot data is loaded yet.',
    };

    summaryCache.set(cacheKey, calibration);
    return calibration;
  }

  function pickMonth(month) {
    const normalizedMonth = normalizeMonth(month);
    if (normalizedMonth) {
      return normalizedMonth;
    }

    return listAvailableMonths()[0] || '';
  }

  function queryPoint(latitude, longitude, month = '') {
    const selectedMonth = pickMonth(month);
    return readMonth(selectedMonth).filter((crime) => {
      const incidentLat = Number(crime.location.latitude);
      const incidentLng = Number(crime.location.longitude);
      return distanceInMeters(latitude, longitude, incidentLat, incidentLng) <= POINT_QUERY_RADIUS_METERS;
    });
  }

  function queryLocation(latitude, longitude, month = '') {
    const crimes = queryPoint(latitude, longitude, month);
    if (!crimes.length) {
      return [];
    }

    let nearestKey = '';
    let nearestDistance = Number.POSITIVE_INFINITY;
    const groups = new Map();

    for (const crime of crimes) {
      const incidentLat = Number(crime.location.latitude);
      const incidentLng = Number(crime.location.longitude);
      const key = `${incidentLat.toFixed(6)}:${incidentLng.toFixed(6)}:${crime.location.street?.name || ''}`;
      const group = groups.get(key) || [];
      group.push(crime);
      groups.set(key, group);

      const distance = distanceInMeters(latitude, longitude, incidentLat, incidentLng);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestKey = key;
      }
    }

    return groups.get(nearestKey) || [];
  }

  function queryPolygon(points, month = '') {
    const selectedMonth = pickMonth(month);
    const crimes = readMonth(selectedMonth);
    const latitudes = points.map((point) => point.latitude);
    const longitudes = points.map((point) => point.longitude);
    const minLatitude = Math.min(...latitudes);
    const maxLatitude = Math.max(...latitudes);
    const minLongitude = Math.min(...longitudes);
    const maxLongitude = Math.max(...longitudes);

    return crimes.filter((crime) => {
      const incidentLat = Number(crime.location.latitude);
      const incidentLng = Number(crime.location.longitude);
      if (incidentLat < minLatitude || incidentLat > maxLatitude || incidentLng < minLongitude || incidentLng > maxLongitude) {
        return false;
      }
      return pointInPolygon(incidentLat, incidentLng, points);
    });
  }

  return {
    rootDir,
    hasFiles() {
      return getFileIndex().length > 0;
    },
    getStatus(limit = 20) {
      const index = getFileIndex();
      const months = [...new Set(index.map((entry) => entry.month))];
      return {
        rootDir,
        localFilesDetected: index.length > 0,
        fileCount: index.length,
        cachedMonths: [...fileCache.keys()].sort((left, right) => right.localeCompare(left)),
        availableMonths: months,
        sampleFiles: index.slice(0, Math.max(1, limit)).map((entry) => ({
          month: entry.month,
          filePath: entry.filePath,
        })),
        manifest: readManifest(),
      };
    },
    listAvailableMonths,
    summarizeCalibration,
    summarizeDataset,
    queryPoint,
    queryLocation,
    queryPolygon,
  };
}
