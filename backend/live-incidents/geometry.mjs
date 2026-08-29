const EARTH_RADIUS_METRES = 6_371_008.8;
const DEFAULT_MAX_COORDINATE_PAIRS = 20_000;

function toRadians(value) {
  return value * Math.PI / 180;
}

function normalizePointInput(value, label = 'coordinate') {
  let pair = value;
  if (typeof pair === 'string') {
    pair = pair.trim().split(/\s+/).map(Number);
  }
  if (!Array.isArray(pair) || pair.length !== 2) {
    throw new TypeError(`${label} must contain longitude and latitude`);
  }

  const [longitude, latitude] = pair.map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new TypeError(`${label} values must be finite numbers`);
  }
  if (longitude < -180 || longitude > 180) {
    throw new RangeError(`${label} longitude must be between -180 and 180`);
  }
  if (latitude < -90 || latitude > 90) {
    throw new RangeError(`${label} latitude must be between -90 and 90`);
  }
  return [longitude, latitude];
}

function normalizeQueryPoint(point) {
  if (!point || typeof point !== 'object') {
    throw new TypeError('point must contain latitude and longitude');
  }
  const [longitude, latitude] = normalizePointInput(
    [point.longitude, point.latitude],
    'point',
  );
  return { latitude, longitude };
}

function coordinatesEqual(left, right) {
  return left[0] === right[0] && left[1] === right[1];
}

function coordinateCounter(limit) {
  let count = 0;
  return () => {
    count += 1;
    if (count > limit) {
      throw new RangeError(`geometry cannot contain more than ${limit.toLocaleString('en-GB')} coordinate pairs`);
    }
  };
}

export function normalizeGeoJsonGeometry(value, options = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('geometry must be a GeoJSON object');
  }
  const maxCoordinatePairs = options.maxCoordinatePairs ?? DEFAULT_MAX_COORDINATE_PAIRS;
  if (!Number.isInteger(maxCoordinatePairs) || maxCoordinatePairs < 1 || maxCoordinatePairs > DEFAULT_MAX_COORDINATE_PAIRS) {
    throw new RangeError(`maxCoordinatePairs must be between 1 and ${DEFAULT_MAX_COORDINATE_PAIRS}`);
  }
  const countCoordinate = coordinateCounter(maxCoordinatePairs);
  const normalizeCoordinate = (coordinate, label) => {
    const normalized = normalizePointInput(coordinate, label);
    countCoordinate();
    return normalized;
  };

  if (value.type === 'Point') {
    return Object.freeze({
      type: 'Point',
      coordinates: Object.freeze(normalizeCoordinate(value.coordinates, 'Point coordinate')),
    });
  }

  if (value.type === 'LineString') {
    if (!Array.isArray(value.coordinates) || value.coordinates.length < 2) {
      throw new TypeError('LineString coordinates must contain at least two points');
    }
    const coordinates = value.coordinates.map((coordinate, index) => Object.freeze(
      normalizeCoordinate(coordinate, `LineString coordinate ${index}`),
    ));
    return Object.freeze({ type: 'LineString', coordinates: Object.freeze(coordinates) });
  }

  if (value.type === 'Polygon') {
    if (!Array.isArray(value.coordinates) || value.coordinates.length === 0) {
      throw new TypeError('Polygon coordinates must contain at least one ring');
    }
    const coordinates = value.coordinates.map((ring, ringIndex) => {
      if (!Array.isArray(ring) || ring.length < 4) {
        throw new TypeError(`Polygon ring ${ringIndex} must contain at least four points`);
      }
      const normalizedRing = ring.map((coordinate, coordinateIndex) => Object.freeze(
        normalizeCoordinate(coordinate, `Polygon ring ${ringIndex} coordinate ${coordinateIndex}`),
      ));
      if (!coordinatesEqual(normalizedRing[0], normalizedRing[normalizedRing.length - 1])) {
        throw new TypeError(`Polygon ring ${ringIndex} must be closed`);
      }
      return Object.freeze(normalizedRing);
    });
    return Object.freeze({ type: 'Polygon', coordinates: Object.freeze(coordinates) });
  }

  throw new TypeError(`Unsupported geometry type: ${String(value.type)}`);
}

function roundCoordinate(value) {
  return Number(value.toFixed(12));
}

function polygonRingCentroid(ring) {
  // Translating near the origin avoids cancellation when a small UK polygon
  // is represented by comparatively large longitude/latitude values.
  const [originLongitude, originLatitude] = ring[0];
  let twiceArea = 0;
  let longitudeSum = 0;
  let latitudeSum = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const leftLongitude = ring[index][0] - originLongitude;
    const leftLatitude = ring[index][1] - originLatitude;
    const rightLongitude = ring[index + 1][0] - originLongitude;
    const rightLatitude = ring[index + 1][1] - originLatitude;
    const cross = leftLongitude * rightLatitude - rightLongitude * leftLatitude;
    twiceArea += cross;
    longitudeSum += (leftLongitude + rightLongitude) * cross;
    latitudeSum += (leftLatitude + rightLatitude) * cross;
  }
  if (Math.abs(twiceArea) < Number.EPSILON) {
    const unique = ring.slice(0, -1);
    return {
      longitude: unique.reduce((sum, coordinate) => sum + coordinate[0], 0) / unique.length,
      latitude: unique.reduce((sum, coordinate) => sum + coordinate[1], 0) / unique.length,
    };
  }
  return {
    longitude: originLongitude + longitudeSum / (3 * twiceArea),
    latitude: originLatitude + latitudeSum / (3 * twiceArea),
  };
}

export function centroidForGeometry(geometry) {
  const normalized = normalizeGeoJsonGeometry(geometry);
  if (normalized.type === 'Point') {
    return Object.freeze({
      latitude: normalized.coordinates[1],
      longitude: normalized.coordinates[0],
    });
  }

  let centroid;
  if (normalized.type === 'LineString') {
    centroid = {
      longitude: normalized.coordinates.reduce((sum, coordinate) => sum + coordinate[0], 0) / normalized.coordinates.length,
      latitude: normalized.coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / normalized.coordinates.length,
    };
  } else {
    centroid = polygonRingCentroid(normalized.coordinates[0]);
  }
  return Object.freeze({
    latitude: roundCoordinate(centroid.latitude),
    longitude: roundCoordinate(centroid.longitude),
  });
}

function haversineDistanceMetres(left, right) {
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function nearestSegmentDistanceMetres(point, startCoordinate, endCoordinate) {
  const referenceLatitude = toRadians(point.latitude);
  const project = ([longitude, latitude]) => ({
    x: toRadians(longitude - point.longitude) * Math.cos(referenceLatitude) * EARTH_RADIUS_METRES,
    y: toRadians(latitude - point.latitude) * EARTH_RADIUS_METRES,
  });
  const start = project(startCoordinate);
  const end = project(endCoordinate);
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  if (lengthSquared === 0) {
    return Math.hypot(start.x, start.y);
  }
  const projection = Math.max(0, Math.min(1, -(start.x * deltaX + start.y * deltaY) / lengthSquared));
  return Math.hypot(start.x + projection * deltaX, start.y + projection * deltaY);
}

function pointOnRingBoundary(point, ring) {
  for (let index = 0; index < ring.length - 1; index += 1) {
    if (nearestSegmentDistanceMetres(point, ring[index], ring[index + 1]) < 0.001) {
      return true;
    }
  }
  return false;
}

function pointInsideRing(point, ring) {
  if (pointOnRingBoundary(point, ring)) return true;
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [currentLongitude, currentLatitude] = ring[current];
    const [previousLongitude, previousLatitude] = ring[previous];
    const crosses = (currentLatitude > point.latitude) !== (previousLatitude > point.latitude)
      && point.longitude < (previousLongitude - currentLongitude)
        * (point.latitude - currentLatitude) / (previousLatitude - currentLatitude)
        + currentLongitude;
    if (crosses) inside = !inside;
  }
  return inside;
}

function distanceToLineMetres(point, coordinates) {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    nearest = Math.min(nearest, nearestSegmentDistanceMetres(point, coordinates[index], coordinates[index + 1]));
  }
  return nearest;
}

export function distanceToGeometryMetres(pointValue, geometryValue) {
  const point = normalizeQueryPoint(pointValue);
  const geometry = normalizeGeoJsonGeometry(geometryValue);
  if (geometry.type === 'Point') {
    return haversineDistanceMetres(point, {
      latitude: geometry.coordinates[1],
      longitude: geometry.coordinates[0],
    });
  }
  if (geometry.type === 'LineString') {
    return distanceToLineMetres(point, geometry.coordinates);
  }

  const insideOuterRing = pointInsideRing(point, geometry.coordinates[0]);
  const insideHole = geometry.coordinates.slice(1).some((ring) => pointInsideRing(point, ring));
  if (insideOuterRing && !insideHole) return 0;
  return Math.min(...geometry.coordinates.map((ring) => distanceToLineMetres(point, ring)));
}
