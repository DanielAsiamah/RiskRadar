export type RouteSourceState = 'enabled' | 'healthy' | 'stale' | 'failed' | 'disabled' | 'not-configured';

export interface RouteLiveData {
  checkedAt: string;
  scope: 'source-network';
  status: 'limited' | 'unavailable';
  sources: Array<{
    sourceId: string;
    label: string;
    state: RouteSourceState;
    lastSuccessAt: string | null;
    staleAfterMs: number | null;
    coverage: { countries: string[]; regions: string[]; kind: string };
  }>;
}

const labels: Record<RouteSourceState, string> = {
  enabled: 'Not checked yet', healthy: 'Fresh', stale: 'Stale', failed: 'Unavailable',
  disabled: 'Not connected', 'not-configured': 'Not configured',
};
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 300;
const stringList = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 20 && value.every(text);
const timestamp = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

export function readRouteLiveData(value: unknown): RouteLiveData | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as RouteLiveData;
  if (!timestamp(data.checkedAt) || data.scope !== 'source-network' || !['limited', 'unavailable'].includes(data.status)
    || !Array.isArray(data.sources) || data.sources.length > 20) return undefined;
  const ids = new Set<string>();
  for (const source of data.sources) {
    if (!source || !text(source.sourceId) || ids.has(source.sourceId) || !text(source.label)
      || !Object.hasOwn(labels, source.state)
      || (source.lastSuccessAt !== null && !timestamp(source.lastSuccessAt))
      || (source.staleAfterMs !== null && (!Number.isFinite(source.staleAfterMs) || source.staleAfterMs <= 0))
      || !source.coverage || !stringList(source.coverage.countries) || !stringList(source.coverage.regions)
      || !text(source.coverage.kind)) return undefined;
    ids.add(source.sourceId);
  }
  return data;
}

export function describeRouteLiveData(value: unknown, now = Date.now()) {
  const data = readRouteLiveData(value);
  const validCheck = data && Number.isFinite(now) && Date.parse(data.checkedAt) <= now + 60_000;
  const sources = (data?.sources ?? []).map((source) => {
    let state = source.state;
    const age = source.lastSuccessAt ? now - Date.parse(source.lastSuccessAt) : NaN;
    if (state === 'healthy' && (!validCheck || !Number.isFinite(age) || age < -60_000
      || source.staleAfterMs === null || age >= source.staleAfterMs)) state = 'stale';
    const coverage = source.coverage.regions.length ? source.coverage.regions : source.coverage.countries;
    return {
      id: source.sourceId, label: source.label, state, stateLabel: labels[state],
      detail: `${coverage.join(', ') || 'Coverage unspecified'} - ${source.coverage.kind}`,
      lastSuccessAt: source.lastSuccessAt,
    };
  });
  const status = validCheck && data.status === 'limited' && sources.some((source) => source.state === 'healthy')
    ? 'limited' : 'unavailable';
  return {
    status,
    title: status === 'limited' ? 'Limited live-source coverage' : 'Live sources unavailable',
    detail: status === 'limited'
      ? 'Only the named feeds and their listed coverage are checked. This is not a live crime feed or an all-clear for your route.'
      : 'Current live conditions could not be confirmed. Historical scores and previously reported incidents may still be shown. Missing reports do not mean no incidents.',
    sources,
  };
}
