const PERSISTENT_ID_PATTERN = /^[a-f0-9]{64}$/i;

function titleCaseWords(value) {
  return String(value || '')
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function formatMonth(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return String(month || 'Unknown month');
  const date = new Date(`${month}-01T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function isValidPersistentId(value) {
  return PERSISTENT_ID_PATTERN.test(String(value || '').trim());
}

export function sanitizeOutcomeName(value) {
  const outcome = String(value || '').trim();
  if (!outcome) return 'Outcome not published';

  return outcome
    .replace(/;?\s*no suspect identified/gi, '')
    .replace(/unable to prosecute suspect/gi, 'Unable to prosecute')
    .replace(/suspect charged/gi, 'Charge recorded')
    .replace(/suspect summonsed to court/gi, 'Court summons recorded')
    .trim();
}

export function buildEvidenceView(payload, persistentId) {
  if (!isValidPersistentId(persistentId)) {
    throw new TypeError('A valid Police.uk persistent crime identifier is required.');
  }

  const crime = payload?.crime || {};
  const month = String(crime.month || payload?.outcomes?.[0]?.date || '');
  const category = String(crime.category || 'other-crime');

  return {
    persistentId,
    category,
    categoryLabel: titleCaseWords(category),
    month,
    monthDisplay: formatMonth(month),
    locationStreet: String(crime?.location?.street?.name || 'Approximate mapped location'),
    latitude: Number(crime?.location?.latitude),
    longitude: Number(crime?.location?.longitude),
    outcomes: (Array.isArray(payload?.outcomes) ? payload.outcomes : []).map((outcome) => ({
      code: String(outcome?.category?.code || ''),
      status: sanitizeOutcomeName(outcome?.category?.name),
      date: String(outcome?.date || ''),
      dateDisplay: formatMonth(outcome?.date),
    })),
    officialSourceUrl: `https://data.police.uk/api/outcomes-for-crime/${encodeURIComponent(persistentId)}`,
    disclosure: 'This is an anonymised Police.uk record. It provides a recorded month and approximate mapped road, not an exact incident day, address, or named person.',
  };
}

function buildRoads(crimes) {
  const counts = new Map();
  for (const crime of crimes) {
    const name = String(crime?.locationStreet || '').trim();
    if (!name || name === 'Unknown street') continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 3)
    .map(([name, count]) => ({ name, count }));
}

function buildEvidenceReferences(crimes) {
  const seen = new Set();
  return crimes
    .filter((crime) => isValidPersistentId(crime?.persistentId))
    .filter((crime) => {
      if (seen.has(crime.persistentId)) return false;
      seen.add(crime.persistentId);
      return true;
    })
    .slice(0, 3)
    .map((crime) => ({
      persistentId: crime.persistentId,
      category: crime.category,
      categoryLabel: crime.categoryLabel || titleCaseWords(crime.category),
      month: crime.month,
      locationStreet: crime.locationStreet,
      officialCaseUrl: crime.officialCaseUrl,
    }));
}

export function buildStructuredRiskSignals({
  district,
  postcode,
  month,
  radiusMeters,
  totalCrimes,
  categories = [],
  crimes = [],
}) {
  const locationLabel = String(postcode || district || 'the searched postcode');
  const distance = Number.isFinite(radiusMeters) ? `within roughly ${Math.round(radiusMeters)} metres of ${locationLabel}` : `near ${locationLabel}`;
  const monthDisplay = formatMonth(month);

  const categorySignals = categories.slice(0, 3).map((category) => {
    const matchingCrimes = crimes.filter((crime) => crime?.category === category.category);
    const categoryLabel = titleCaseWords(category.category || 'other-crime');
    const isBroadViolentCategory = category.category === 'violent-crime';

    return {
      id: category.category,
      category: category.category,
      categoryLabel,
      count: Number(category.count) || 0,
      month: String(month || ''),
      monthDisplay,
      headline: `${Number(category.count) || 0} ${categoryLabel.toLowerCase()} records were published ${distance}.`,
      detail: isBroadViolentCategory
        ? 'Police.uk publishes Violent Crime as a broad category; the public street-level feed does not provide a reliable individual offence subtype.'
        : `These are anonymised Police.uk records for the latest available month around the searched postcode point in ${district || locationLabel}.`,
      roads: buildRoads(matchingCrimes),
      evidence: buildEvidenceReferences(matchingCrimes),
    };
  });

  const volumeDetail = totalCrimes >= 25
    ? `The ${totalCrimes} records describe activity inside the postcode search radius. This is an incident-volume context signal, not a live population or whole-${district || 'district'} crime rate.`
    : `The ${totalCrimes} records describe the postcode search radius only and should not be treated as a live population or whole-area crime rate.`;

  return [
    ...categorySignals,
    {
      id: 'local-volume',
      category: 'local-volume',
      categoryLabel: 'Local Incident Context',
      count: Number(totalCrimes) || 0,
      month: String(month || ''),
      monthDisplay,
      headline: `${Number(totalCrimes) || 0} total records were matched ${distance}.`,
      detail: volumeDetail,
      roads: buildRoads(crimes),
      evidence: [],
    },
  ];
}
