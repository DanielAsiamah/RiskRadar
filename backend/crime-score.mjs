const SCORE_MODEL_VERSION = 'uk-local-pressure-v2';

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
    thresholds: [[25, 1], [60, 2], [120, 3], [220, 5]],
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

export function calculateCrimeScore(categories = [], totalCrimes = 0) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const incidentCount = Math.max(0, Number(totalCrimes) || 0);

  if (incidentCount === 0) {
    return {
      score: 2,
      model: SCORE_MODEL_VERSION,
      factors: [],
      explanation: 'No incidents were returned in the local search radius. A small baseline remains because public data coverage is not a guarantee of zero risk.',
    };
  }

  const factors = [];
  let score = 2;
  const volumePoints = thresholdPoints(incidentCount, [[20, 1], [50, 2], [100, 3], [200, 4], [350, 5]]);
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

  const extremePressurePoints = thresholdPoints(incidentCount, [[600, 2], [900, 5], [1300, 9]]);
  addFactor(factors, 'extreme-pressure', 'Exceptional incident density', incidentCount, extremePressurePoints, `${incidentCount} incidents are in an exceptional local-density band.`);
  score += extremePressurePoints;

  const violentShare = violentCount / incidentCount;
  if (violentCount >= 100 && violentShare >= 0.45) {
    score += 2;
    addFactor(factors, 'violent-concentration', 'Violent-crime concentration', violentCount, 2, `${Math.round(violentShare * 100)}% of local incidents are violent crime, with at least 100 reports.`);
  }

  return {
    score: clamp(Math.round(score), 1, 70),
    model: SCORE_MODEL_VERSION,
    factors,
    explanation: 'The score uses one month of incidents inside the selected local boundary. Ordinary urban volume adds only a few points; 50+ requires several exceptional serious-crime and density thresholds at once.',
  };
}

export function blendPostcodeScore(postcodeResult, contextResult) {
  const localScore = Number(postcodeResult?.score || 0);
  const contextScore = Number(contextResult?.score || 0);
  const contextAdjustment = clamp(Math.round((contextScore - localScore) * 0.15), -2, 3);

  return {
    score: clamp(localScore + contextAdjustment, 1, 70),
    localScore,
    contextScore,
    contextAdjustment,
  };
}

export const crimeScoreModel = {
  id: SCORE_MODEL_VERSION,
  displayScaleMaximum: 100,
  modelCap: 70,
  postcodeWeightDescription: 'The 400 metre postcode score is primary. The wider 900 metre context can adjust it by no more than -2 to +3 points.',
  homicideLimitation: 'The public UK Police street-level category feed normally groups homicide within violent crime, so a separate murder increment is only applied when a source explicitly supplies a homicide category.',
};
