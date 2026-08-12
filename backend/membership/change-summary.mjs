function clampPercent(value) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value);
}

function average(values) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function titleCaseCategory(category) {
  return String(category || 'other-crime')
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function categoryCount(snapshot, category) {
  return snapshot?.categories?.find((entry) => entry.category === category)?.count || 0;
}

function movementDirection(currentValue, previousValue) {
  const delta = currentValue - previousValue;

  if (previousValue <= 0) {
    if (currentValue >= 3) {
      return 'rising';
    }

    return currentValue === 0 ? 'stable' : 'stable';
  }

  const changePercent = ((currentValue - previousValue) / previousValue) * 100;

  if (delta >= 3 && changePercent >= 10) {
    return 'rising';
  }

  if (delta <= -3 && changePercent <= -10) {
    return 'cooling';
  }

  return 'stable';
}

function buildCategoryMovements(current, previous) {
  const currentCategories = Array.isArray(current?.categories) ? current.categories : [];
  return currentCategories.map((entry) => {
    const previousCount = categoryCount(previous, entry.category);
    return {
      category: entry.category,
      currentCount: entry.count,
      previousCount,
      direction: movementDirection(entry.count, previousCount),
      label: titleCaseCategory(entry.category),
    };
  });
}

function summarizeCategoryMovement(movement) {
  if (!movement || movement.direction === 'stable') {
    return null;
  }

  const label = movement.label.toLowerCase();
  if (movement.direction === 'rising') {
    return `${label} rose slightly`;
  }

  return `${label} cooled slightly`;
}

function summarizeOverallDirection(direction, changePercent) {
  if (direction === 'rising') {
    return `Total recorded incidents rose ${Math.abs(changePercent)}% against the previous three-month average`;
  }

  if (direction === 'cooling') {
    return `Total recorded incidents fell ${Math.abs(changePercent)}% against the previous three-month average`;
  }

  return 'Recorded incident levels are broadly stable against the recent baseline.';
}

export function compareWatchSnapshots(current, previous) {
  const baselineTrend = Array.isArray(previous?.trend)
    ? previous.trend.filter((point) => Number.isFinite(point?.total)).slice(-3)
    : [];

  if (baselineTrend.length < 2) {
    return {
      direction: 'insufficient-data',
      changePercent: 0,
      baselineAverage: null,
      scoreDirection: 'insufficient-data',
      categoryMovements: buildCategoryMovements(current, previous),
      summary: 'Not enough comparable months are available yet to describe a stable change pattern.',
    };
  }

  const baselineAverage = average(baselineTrend.map((point) => point.total));
  const currentTotal = Number(current?.totalIncidents) || 0;
  const delta = currentTotal - baselineAverage;
  const changePercent = baselineAverage <= 0
    ? (currentTotal > 0 ? 100 : 0)
    : clampPercent((delta / baselineAverage) * 100);

  let direction = 'stable';
  if (baselineAverage <= 0) {
    direction = currentTotal >= 3 ? 'rising' : 'stable';
  } else if (delta >= 3 && changePercent >= 10) {
    direction = 'rising';
  } else if (delta <= -3 && changePercent <= -10) {
    direction = 'cooling';
  }

  const previousScore = Number(previous?.score) || 0;
  const currentScore = Number(current?.score) || 0;
  const scoreDirection = movementDirection(currentScore, previousScore);
  const categoryMovements = buildCategoryMovements(current, previous);
  const leadCategoryMovement = categoryMovements.find((movement) => movement.direction !== 'stable') || null;

  if (baselineAverage <= 0 && currentTotal > 0) {
    const categoryText = leadCategoryMovement
      ? `, with ${leadCategoryMovement.label.toLowerCase()} now appearing in the latest month.`
      : '.';

    return {
      direction,
      changePercent,
      baselineAverage: 0,
      scoreDirection,
      categoryMovements,
      summary: `Recorded incidents rose from a zero recent baseline${categoryText}`,
    };
  }

  const overallSummary = summarizeOverallDirection(direction, changePercent);
  const categorySummary = summarizeCategoryMovement(leadCategoryMovement);

  return {
    direction,
    changePercent,
    baselineAverage: clampPercent(baselineAverage),
    scoreDirection,
    categoryMovements,
    summary: categorySummary && direction !== 'stable'
      ? `${overallSummary}, while ${categorySummary}.`
      : overallSummary,
  };
}
