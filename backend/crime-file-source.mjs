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

export function createCrimeFileSource(options = {}) {
  const rootDir = path.resolve(String(options.rootDir || path.join(process.cwd(), 'backend', 'data', 'police')));
  const fileCache = new Map();
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
      };
    },
    listAvailableMonths,
    queryPoint,
    queryLocation,
    queryPolygon,
  };
}
