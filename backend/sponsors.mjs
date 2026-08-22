import { readFile } from 'node:fs/promises';

const ALLOWED_PLACEMENTS = new Set(['home', 'result']);
const MAX_CONFIG_BYTES = 1024 * 1024;

function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';

  return value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .trim();
}

function normalizeDistrict(value) {
  return sanitizeText(value, 80).toLocaleLowerCase('en-GB');
}

function safeDestinationUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function parseOptionalDate(value) {
  if (value === undefined || value === null || value === '') {
    return { valid: true, time: null };
  }

  const time = Date.parse(String(value));
  return Number.isFinite(time)
    ? { valid: true, time }
    : { valid: false, time: null };
}

function normalizeSponsor(candidate, placement, nowTime) {
  if (!candidate || typeof candidate !== 'object' || candidate.active !== true) return null;
  if (candidate.placement !== placement || !ALLOWED_PLACEMENTS.has(candidate.placement)) return null;

  const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(id)) return null;

  const businessName = sanitizeText(candidate.businessName, 80);
  const message = sanitizeText(candidate.message, 220);
  const destinationUrl = safeDestinationUrl(candidate.destinationUrl);
  if (!businessName || !message || !destinationUrl) return null;

  const start = parseOptionalDate(candidate.startsAt);
  const end = parseOptionalDate(candidate.endsAt);
  if (!start.valid || !end.valid) return null;
  if (start.time !== null && nowTime < start.time) return null;
  if (end.time !== null && nowTime > end.time) return null;

  const district = normalizeDistrict(candidate.district);
  return {
    district,
    view: {
      id,
      label: 'Sponsored local business',
      businessName,
      message,
      destinationUrl,
      placement,
    },
  };
}

export function selectSponsorView(config, { placement, district = '', now = new Date() } = {}) {
  if (!ALLOWED_PLACEMENTS.has(placement)) return null;

  const inventory = Array.isArray(config)
    ? config
    : Array.isArray(config?.sponsors)
      ? config.sponsors
      : [];
  const requestedDistrict = normalizeDistrict(district);
  const parsedNow = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const nowTime = Number.isFinite(parsedNow) ? parsedNow : Date.now();
  let globalFallback = null;

  for (const candidate of inventory) {
    const sponsor = normalizeSponsor(candidate, placement, nowTime);
    if (!sponsor) continue;

    if (sponsor.district) {
      if (requestedDistrict && sponsor.district === requestedDistrict) {
        return sponsor.view;
      }
      continue;
    }

    globalFallback ??= sponsor.view;
  }

  return globalFallback;
}

export async function loadSponsorView({
  configFile,
  placement,
  district = '',
  now = new Date(),
  readText = (file) => readFile(file, 'utf8'),
} = {}) {
  if (typeof configFile !== 'string' || !configFile.trim()) return null;

  try {
    const raw = await readText(configFile.trim());
    if (typeof raw !== 'string' || Buffer.byteLength(raw, 'utf8') > MAX_CONFIG_BYTES) {
      return null;
    }
    return selectSponsorView(JSON.parse(raw), { placement, district, now });
  } catch {
    return null;
  }
}
