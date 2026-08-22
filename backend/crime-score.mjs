const SCORE_MODEL_VERSION = 'uk-local-pressure-v3';

const CATEGORY_RULES = [
  {
    key: 'homicide',
    label: 'Homicide',
    thresholds: [[1, 3], [2, 6], [4, 10]],
  },
  {
    key: 'robbery',
    label: 'Robbery',
    thresholds: [[10, 1], [25, 2], [50, 5], [100, 7]],
  },
  {
    key: 'possession-of-weapons',
    label: 'Weapons offences',
    thresholds: [[5, 1], [15, 2], [30, 4], [60, 6]],
  },
  {
    key: 'violent-crime',
    aliases: ['violence-and-sexual-offences'],
    label: 'Violent crime',
    thresholds: [[1, 2], [5, 7], [10, 14], [20, 22], [35, 30], [60, 38], [100, 46]],
  },
  {
    key: 'burglary',
    label: 'Burglary',
    thresholds: [[20, 1], [50, 2], [100, 3]],
  },
  {
    key: 'anti-social-behaviour',
    label: 'Anti-social behaviour',
    thresholds: [[50, 1], [120, 2], [250, 3]],
  },
  {
    key: 'vehicle-crime',
    label: 'Vehicle crime',
    thresholds: [[30, 1], [75, 2], [150, 3]],
  },
  {
    key: 'drugs',
    label: 'Drug offences',
    thresholds: [[20, 1], [50, 2], [100, 3]],
  },
];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function thresholdPoints(count, thresholds) {
  return thresholds.reduce((points, [minimum, award]) => (count >= minimum ? award : points), 0);
}

function categoryCount(categories, keys) {
  const wanted = new Set(keys);
  return categories.reduce((total, category) => (
    wanted.has(String(category?.category || '')) ? total + Number(category?.count || 0) : total
  ), 0);
}

function addFactor(factors, id, label, count, points, detail) {
  if (points <= 0) {
    return;
  }

  factors.push({ id, label, count, points, detail });
}

function parseEvaluationDate(value) {
  const parsed = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getLondonDateParts(date) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    weekday: 'long',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const lookup = {};

  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      lookup[part.type] = part.value;
    }
  }

  return {
    weekday: String(lookup.weekday || ''),
    month: Number(lookup.month || 0),
    day: Number(lookup.day || 0),
    hour: Number(lookup.hour || 0),
    minute: Number(lookup.minute || 0),
    localTimeLabel: `${lookup.weekday || 'Unknown'} ${lookup.day || ''}/${lookup.month || ''} ${lookup.hour || '00'}:${lookup.minute || '00'} UK time`.trim(),
  };
}

function addTimingFactor(factors, remainingState, id, label, requestedPoints, detail) {
  const awardedPoints = Math.min(Math.max(remainingState.remaining, 0), Math.max(requestedPoints, 0));
  if (awardedPoints <= 0) {
    return;
  }

  remainingState.remaining -= awardedPoints;
  factors.push({ id, label, points: awardedPoints, detail });
}

function buildTimingContext(categories, totalCrimes, evaluationDate, baseScore) {
  const parsedDate = parseEvaluationDate(evaluationDate);
  if (!parsedDate) {
    return null;
  }

  const london = getLondonDateParts(parsedDate);
  const isNight = london.hour >= 21 || london.hour < 5;
  const isWeekend = london.weekday === 'Saturday' || london.weekday === 'Sunday';
  const isStudentSeason = london.month === 8 || london.month === 9;
  const isChristmasSeason = london.month === 11 || london.month === 12;

  const violentCount = categoryCount(categories, ['violent-crime', 'violence-and-sexual-offences']);
  const robberyCount = categoryCount(categories, ['robbery']);
  const drugsCount = categoryCount(categories, ['drugs']);
  const antiSocialCount = categoryCount(categories, ['anti-social-behaviour']);
  const publicOrderCount = categoryCount(categories, ['public-order']);
  const burglaryCount = categoryCount(categories, ['burglary']);
  const shopliftingCount = categoryCount(categories, ['shoplifting']);
  const bicycleTheftCount = categoryCount(categories, ['bicycle-theft']);
  const theftCount = categoryCount(categories, ['other-theft', 'theft', 'theft-from-the-person']);

  const nightPressure = violentCount + robberyCount + drugsCount + theftCount;
  const weekendPressure = violentCount + antiSocialCount + publicOrderCount + drugsCount + robberyCount;
  const studentPressure = burglaryCount + theftCount + bicycleTheftCount;
  const christmasPressure = shopliftingCount + burglaryCount + theftCount + bicycleTheftCount;

  const factors = [];
  const remainingState = { remaining: 4 };

  if (isNight && (nightPressure >= 25 || violentCount >= 10 || totalCrimes >= 40)) {
    addTimingFactor(
      factors,
      remainingState,
      'night',
      'Late-night pressure',
      nightPressure >= 25 || violentCount >= 10 ? 2 : 1,
      `The current UK time window is late at night, which tends to raise the relative pressure of violence, robbery, and opportunistic theft around active routes.`,
    );
  }

  if (isWeekend && (weekendPressure >= 25 || totalCrimes >= 50)) {
    addTimingFactor(
      factors,
      remainingState,
      'weekend',
      'Weekend uplift',
      weekendPressure >= 45 || violentCount >= 15 ? 2 : 1,
      `The current UK day falls on a weekend, when nightlife, gatherings, and public-order activity can make the local pattern less forgiving.`,
    );
  }

  if (isStudentSeason && studentPressure >= 30) {
    addTimingFactor(
      factors,
      remainingState,
      'student-season',
      'Student move-in season',
      1,
      `August and September can lift property and street disorder pressure in move-in periods, especially where burglary and theft are already visible.`,
    );
  }

  if (isChristmasSeason && christmasPressure >= 25) {
    addTimingFactor(
      factors,
      remainingState,
      'christmas',
      'Christmas theft season',
      christmasPressure >= 50 ? 2 : 1,
      `The late-year shopping and travel period can lift burglary and theft pressure where those categories are already active in the local feed.`,
    );
  }

  const totalAdjustment = factors.reduce((sum, factor) => sum + factor.points, 0);
  const summary = factors.length
    ? `Current UK timing conditions add ${totalAdjustment} point${totalAdjustment === 1 ? '' : 's'} because ${factors.map((factor) => factor.label.toLowerCase()).join(', ')} are active.`
    : 'No Premium timing adjustment is active for the current UK local time window.';

  return {
    evaluatedAt: parsedDate.toISOString(),
    localTimeLabel: london.localTimeLabel,
    totalAdjustment,
    adjustedScore: clamp(baseScore + totalAdjustment, 1, 95),
    summary,
    factors,
  };
}

export function calculateCrimeScore(categories = [], totalCrimes = 0, options = {}) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const incidentCount = Math.max(0, Number(totalCrimes) || 0);

  if (incidentCount === 0) {
    const timingContext = buildTimingContext(safeCategories, incidentCount, options?.evaluationDate, 5);
    return {
      score: 5,
      model: SCORE_MODEL_VERSION,
      factors: [],
      timingContext,
      explanation: 'No incidents were returned in the local search radius. A small baseline remains because public data coverage is not a guarantee of zero risk.',
    };
  }

  const factors = [];
  let score = 5;
  const volumePoints = thresholdPoints(incidentCount, [[5, 2], [10, 4], [20, 7], [40, 10], [75, 14], [120, 18], [200, 22], [350, 28]]);
  addFactor(factors, 'local-volume', 'Local incident volume', incidentCount, volumePoints, `${incidentCount} incidents were recorded inside the selected local boundary.`);
  score += volumePoints;

  for (const rule of CATEGORY_RULES) {
    const count = categoryCount(safeCategories, [rule.key, ...(rule.aliases || [])]);
    const points = thresholdPoints(count, rule.thresholds);
    addFactor(factors, rule.key, rule.label, count, points, `${count} ${rule.label.toLowerCase()} incidents crossed the model's ${points}-point threshold.`);
    score += points;
  }

  const theftCount = categoryCount(safeCategories, [
    'other-theft',
    'theft',
    'theft-from-the-person',
    'shoplifting',
    'bicycle-theft',
  ]);
  const theftPoints = thresholdPoints(theftCount, [[100, 1], [250, 2], [500, 3]]);
  addFactor(factors, 'theft', 'Theft-related crime', theftCount, theftPoints, `${theftCount} theft-related incidents add limited pressure because they do not indicate serious violence on their own.`);
  score += theftPoints;

  const robberyCount = categoryCount(safeCategories, ['robbery']);
  const weaponsCount = categoryCount(safeCategories, ['possession-of-weapons']);
  const violentCount = categoryCount(safeCategories, ['violent-crime', 'violence-and-sexual-offences']);
  const seriousHarmCount = robberyCount + weaponsCount;
  const seriousHarmPoints = thresholdPoints(seriousHarmCount, [[75, 1], [150, 2], [300, 4]]);
  addFactor(factors, 'serious-harm-cluster', 'Serious-harm concentration', seriousHarmCount, seriousHarmPoints, `${seriousHarmCount} combined robbery and weapons incidents indicate an unusually concentrated serious-harm pattern.`);
  score += seriousHarmPoints;

  const extremePressurePoints = thresholdPoints(incidentCount, [[600, 3], [900, 7], [1300, 12]]);
  addFactor(factors, 'extreme-pressure', 'Exceptional incident density', incidentCount, extremePressurePoints, `${incidentCount} incidents are in an exceptional local-density band.`);
  score += extremePressurePoints;

  const violentShare = violentCount / incidentCount;
  if (violentCount >= 10 && violentShare >= 0.35) {
    const concentrationPoints = thresholdPoints(violentShare, [[0.35, 2], [0.5, 4], [0.65, 6]]);
    score += concentrationPoints;
    addFactor(factors, 'violent-concentration', 'Violent-crime concentration', violentCount, concentrationPoints, `${Math.round(violentShare * 100)}% of local incidents are violent crime.`);
  }

  const violentMinimumScore = thresholdPoints(violentCount, [[10, 35], [20, 50], [35, 65], [60, 75], [100, 85]]);
  if (violentMinimumScore > score) {
    const floorAdjustment = violentMinimumScore - score;
    score = violentMinimumScore;
    addFactor(factors, 'violent-severity-floor', 'Violent-crime severity band', violentCount, floorAdjustment, `${violentCount} violent incidents set a minimum local risk band of ${violentMinimumScore}/100.`);
  }

  const stableScore = clamp(Math.round(score), 1, 95);
  const timingContext = buildTimingContext(safeCategories, incidentCount, options?.evaluationDate, stableScore);

  return {
    score: stableScore,
    minimumScore: violentMinimumScore || 0,
    model: SCORE_MODEL_VERSION,
    factors,
    timingContext,
    explanation: 'The score uses one month of incidents inside the selected local boundary. Total volume shapes the baseline, while violent-crime count and concentration establish stronger minimum severity bands.',
  };
}

export function blendPostcodeScore(postcodeResult, contextResult) {
  const localScore = Number(postcodeResult?.score || 0);
  const contextScore = Number(contextResult?.score || 0);
  const minimumScore = Number(postcodeResult?.minimumScore || 0);
  const contextAdjustment = clamp(Math.round((contextScore - localScore) * 0.15), -2, 5);

  return {
    score: clamp(Math.max(minimumScore, localScore + contextAdjustment), 1, 95),
    localScore,
    contextScore,
    contextAdjustment,
  };
}

export const crimeScoreModel = {
  id: SCORE_MODEL_VERSION,
  displayScaleMaximum: 100,
  modelCap: 95,
  postcodeWeightDescription: 'The 400 metre postcode score is primary. The wider 900 metre context can adjust it by no more than -2 to +5 points, without lowering a violent-crime severity floor.',
  timingWeightDescription: 'Premium timing context can preview a small current-time uplift for late-night, weekend, student move-in, or Christmas theft windows when the visible category mix supports it.',
  homicideLimitation: 'The public UK Police street-level category feed normally groups homicide within violent crime, so a separate murder increment is only applied when a source explicitly supplies a homicide category.',
};
