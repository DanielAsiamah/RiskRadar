const MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

function parseMonth(value) {
  const match = MONTH_PATTERN.exec(String(value || '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  return {
    value: `${match[1]}-${match[2]}`,
    index: (year * 12) + month - 1,
  };
}

function describeCount(value) {
  const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  return words[value] || String(value);
}

function unavailableFreshness(checkedAt) {
  return {
    confidence: 'unavailable',
    label: 'Freshness unavailable',
    status: 'unavailable',
    dataMonth: null,
    latestAvailableMonth: null,
    publicationLagMonths: null,
    sourceLagMonths: null,
    checkedAt,
    summary: 'RiskRadar could not verify the recorded month for this result.',
    warning: 'Treat this result cautiously and check the official Police.uk source before relying on its timing.',
  };
}

export function findLatestAdvertisedMonth(monthly) {
  if (!Array.isArray(monthly)) return null;

  let latest = null;
  for (const point of monthly) {
    const parsed = parseMonth(point?.month);
    if (parsed && (!latest || parsed.index > latest.index)) {
      latest = parsed;
    }
  }

  return latest?.value || null;
}

export function buildDataFreshness({ dataMonth, latestAvailableMonth, checkedAt = new Date().toISOString() } = {}) {
  const checkedDate = new Date(checkedAt);
  if (Number.isNaN(checkedDate.getTime())) {
    return unavailableFreshness('');
  }

  const normalizedCheckedAt = checkedDate.toISOString();
  const parsedDataMonth = parseMonth(dataMonth);

  if (!parsedDataMonth) {
    return unavailableFreshness(normalizedCheckedAt);
  }

  const checkedMonthIndex = (checkedDate.getUTCFullYear() * 12) + checkedDate.getUTCMonth();
  const publicationLagMonths = Math.max(0, checkedMonthIndex - parsedDataMonth.index);
  const parsedLatestMonth = parseMonth(latestAvailableMonth);
  const sourceLagMonths = parsedLatestMonth
    ? Math.max(0, parsedLatestMonth.index - parsedDataMonth.index)
    : null;

  if (sourceLagMonths === 0 && publicationLagMonths <= 3) {
    return {
      confidence: 'high',
      label: 'High freshness confidence',
      status: 'current-release',
      dataMonth: parsedDataMonth.value,
      latestAvailableMonth: parsedLatestMonth.value,
      publicationLagMonths,
      sourceLagMonths,
      checkedAt: normalizedCheckedAt,
      summary: 'This result uses the latest available Police.uk release.',
      warning: `Street-level records are monthly and currently describe ${publicationLagMonths} ${publicationLagMonths === 1 ? 'month' : 'months'} before today, not live incidents.`,
    };
  }

  if (sourceLagMonths === 1 || (sourceLagMonths === 0 && publicationLagMonths === 4)) {
    const sourceLine = sourceLagMonths === 1
      ? 'This result is one published month behind the latest available Police.uk release.'
      : 'This is the latest available Police.uk release, but its publication lag is longer than usual.';

    return {
      confidence: 'medium',
      label: 'Medium freshness confidence',
      status: sourceLagMonths === 1 ? 'behind-source' : 'delayed-release',
      dataMonth: parsedDataMonth.value,
      latestAvailableMonth: parsedLatestMonth?.value || null,
      publicationLagMonths,
      sourceLagMonths,
      checkedAt: normalizedCheckedAt,
      summary: sourceLine,
      warning: `${sourceLine} Use the score as monthly area context rather than a current incident reading.`,
    };
  }

  if (sourceLagMonths !== null && sourceLagMonths >= 2) {
    const lagText = describeCount(sourceLagMonths);
    return {
      confidence: 'low',
      label: 'Low freshness confidence',
      status: 'stale',
      dataMonth: parsedDataMonth.value,
      latestAvailableMonth: parsedLatestMonth?.value || null,
      publicationLagMonths,
      sourceLagMonths,
      checkedAt: normalizedCheckedAt,
      summary: `This result is ${lagText} published months behind the latest available Police.uk release.`,
      warning: `This result is ${lagText} published months behind. Refresh or check the official source before relying on it.`,
    };
  }

  const confidence = publicationLagMonths <= 3 ? 'medium' : 'low';
  return {
    confidence,
    label: `${confidence === 'medium' ? 'Medium' : 'Low'} freshness confidence`,
    status: 'source-unverified',
    dataMonth: parsedDataMonth.value,
    latestAvailableMonth: null,
    publicationLagMonths,
    sourceLagMonths: null,
    checkedAt: normalizedCheckedAt,
    summary: 'The recorded month is valid, but the latest Police.uk release could not be compared.',
    warning: 'RiskRadar could not confirm whether a newer published month exists. Refresh or check Police.uk for the latest release.',
  };
}
