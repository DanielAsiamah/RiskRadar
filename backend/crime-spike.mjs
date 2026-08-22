const CATEGORY_RULES = Object.freeze([
  {
    key: 'violentCrimes',
    category: 'violent-crime',
    label: 'Violent crime',
    minimumDelta: 5,
    minimumPercent: 30,
  },
  {
    key: 'antiSocialCrimes',
    category: 'anti-social-behaviour',
    label: 'Anti-social behaviour',
    minimumDelta: 5,
    minimumPercent: 30,
  },
  {
    key: 'robberyCrimes',
    category: 'robbery',
    label: 'Robbery',
    minimumDelta: 3,
    minimumPercent: 50,
  },
]);

function roundOne(value) {
  return Math.round(value * 10) / 10;
}

function average(values) {
  return roundOne(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function percentageChange(latest, baseline) {
  if (baseline <= 0) return latest > 0 ? 100 : 0;
  return Math.round(((latest - baseline) / baseline) * 100);
}

function createMetric(latestCount, baselineAverage, minimumDelta, minimumPercent) {
  const delta = roundOne(latestCount - baselineAverage);
  const changePercent = percentageChange(latestCount, baselineAverage);
  return {
    latestCount,
    baselineAverage,
    delta,
    changePercent,
    spiking: delta >= minimumDelta && changePercent >= minimumPercent,
  };
}

function insufficientDataResult() {
  return {
    status: 'insufficient-data',
    latestMonth: null,
    baselineMonths: 0,
    total: {
      latestCount: 0,
      baselineAverage: 0,
      delta: 0,
      changePercent: 0,
      spiking: false,
    },
    categorySpikes: [],
    summary: 'Four usable monthly snapshots are required before RiskRadar can test for a recent spike.',
  };
}

export function detectRecentCrimeSpike(monthly) {
  const usable = (Array.isArray(monthly) ? monthly : [])
    .filter((point) => (
      point?.dataAvailable !== false
      && /^\d{4}-\d{2}$/.test(String(point?.month || ''))
      && Number.isFinite(Number(point?.totalCrimes))
    ))
    .sort((left, right) => String(left.month).localeCompare(String(right.month)));

  if (usable.length < 4) {
    return insufficientDataResult();
  }

  const latest = usable.at(-1);
  const baseline = usable.slice(-4, -1);
  const total = createMetric(
    Number(latest.totalCrimes),
    average(baseline.map((point) => Number(point.totalCrimes))),
    10,
    25
  );
  const categorySpikes = CATEGORY_RULES.map((rule) => {
    const metric = createMetric(
      Number(latest[rule.key] || 0),
      average(baseline.map((point) => Number(point[rule.key] || 0))),
      rule.minimumDelta,
      rule.minimumPercent
    );

    return {
      category: rule.category,
      label: rule.label,
      ...metric,
    };
  }).filter((metric) => metric.spiking);

  if (total.spiking) {
    const categoryLine = categorySpikes.length
      ? ` ${categorySpikes.map((item) => item.label).join(' and ')} also crossed the category spike threshold.`
      : '';
    return {
      status: 'spike',
      latestMonth: latest.month,
      baselineMonths: baseline.length,
      total,
      categorySpikes,
      summary: `The latest total is ${total.changePercent}% above the previous three-month average, an increase of ${total.delta} incidents.${categoryLine}`,
    };
  }

  if (categorySpikes.length) {
    const lead = [...categorySpikes].sort((left, right) => right.changePercent - left.changePercent)[0];
    return {
      status: 'spike',
      latestMonth: latest.month,
      baselineMonths: baseline.length,
      total,
      categorySpikes,
      summary: `${lead.label} is ${lead.changePercent}% above its previous three-month average, while the overall incident total remains below the spike threshold.`,
    };
  }

  return {
    status: 'stable',
    latestMonth: latest.month,
    baselineMonths: baseline.length,
    total,
    categorySpikes: [],
    summary: 'No statistically useful recent spike was detected against the previous three usable months.',
  };
}
