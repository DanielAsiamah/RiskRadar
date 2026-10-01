function validScore(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function validCoordinate(value, limit) {
  return (typeof value === 'number' || typeof value === 'string' && value.trim() !== '')
    && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= limit;
}

export function createRoutePointAnalyzer({ loadCrimeData }) {
  return async ({ latitude, longitude }) => {
    let timer;
    try {
      // Shared upstream fetches may finish warming the cache after this request's deadline.
      const crimeData = await Promise.race([
        loadCrimeData(latitude, longitude),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error('Route risk lookup timed out.'), { statusCode: 504 })), 10_000);
        }),
      ]);
      if (!validScore(crimeData?.crimeScore)
        || !validScore(crimeData?.timingContext?.adjustedScore ?? crimeData?.crimeScore)) {
        throw new Error('Route analysis did not include a valid baseline and time context.');
      }
      return { crimeData };
    } finally {
      clearTimeout(timer);
    }
  };
}

export function requireRouteCrimeRecords(value) {
  if (!Array.isArray(value) || value.some((crime) => (
    !crime || typeof crime.category !== 'string' || !crime.category
    || typeof crime.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(crime.month)
    || !validCoordinate(crime.location?.latitude, 90)
    || !validCoordinate(crime.location?.longitude, 180)
  ))) {
    throw Object.assign(new Error('Route crime data is unavailable or malformed.'), { statusCode: 502 });
  }
  return value;
}
