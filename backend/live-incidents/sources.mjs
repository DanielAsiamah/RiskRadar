const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

export const LIVE_SOURCE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'environment-agency-floods-england',
    provider: 'environment-agency',
    label: 'Environment Agency flood warnings',
    coverage: Object.freeze({ countries: Object.freeze(['England']), regions: Object.freeze([]), kind: 'flood' }),
    defaultState: 'enabled',
    pollIntervalMs: FIFTEEN_MINUTES_MS,
    staleAfterMs: 45 * 60 * 1000,
    disclosure: 'This uses Environment Agency flood and river level data from the real-time data API (Beta).',
  }),
  Object.freeze({
    id: 'tfl-disruptions-london', provider: 'transport-for-london', label: 'TfL road and transport disruptions',
    coverage: Object.freeze({ countries: Object.freeze(['England']), regions: Object.freeze(['London']), kind: 'transport' }),
    defaultState: 'not-configured', pollIntervalMs: FIFTEEN_MINUTES_MS, staleAfterMs: null,
    disclosure: 'TfL live disruptions need a configured provider key before they can be displayed.',
  }),
  Object.freeze({
    id: 'national-highways-england', provider: 'national-highways', label: 'National Highways road disruptions',
    coverage: Object.freeze({ countries: Object.freeze(['England']), regions: Object.freeze([]), kind: 'road' }),
    defaultState: 'disabled', pollIntervalMs: FIFTEEN_MINUTES_MS, staleAfterMs: null,
    disclosure: 'National Highways live disruptions are disabled until an approved provider integration is connected.',
  }),
  ...['Wales', 'Scotland', 'Northern Ireland'].map((country) => Object.freeze({
    id: `flood-${country.toLowerCase().replaceAll(' ', '-')}`,
    provider: country === 'Wales' ? 'natural-resources-wales' : country === 'Scotland' ? 'sepa' : 'northern-ireland-flood-information',
    label: `${country} live flood feed`,
    coverage: Object.freeze({ countries: Object.freeze([country]), regions: Object.freeze([]), kind: 'flood' }),
    defaultState: 'not-configured', pollIntervalMs: FIFTEEN_MINUTES_MS, staleAfterMs: null,
    disclosure: `${country} live flood feed not yet connected.`,
  })),
]);

export function createInitialSourceStates(env = {}, now = () => new Date()) {
  const at = now().toISOString();
  return LIVE_SOURCE_DEFINITIONS.map((source) => ({
    sourceId: source.id,
    provider: source.provider,
    state: source.id === 'tfl-disruptions-london' && !env.TFL_APP_KEY ? 'not-configured' : source.defaultState,
    lastAttemptAt: null,
    lastSuccessAt: null,
    sourceWatermark: null,
    httpStatus: null,
    latencyMs: null,
    counts: {},
    staleAfterMs: source.staleAfterMs,
    disclosure: source.disclosure,
    initializedAt: at,
  }));
}
