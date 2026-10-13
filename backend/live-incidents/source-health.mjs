const STATES = new Set(['enabled', 'healthy', 'stale', 'failed', 'disabled', 'not-configured']);

export function createLiveDataStatus(definitions = [], states = [], checkedAt = new Date().toISOString()) {
  const at = Date.parse(checkedAt);
  const sources = definitions.map((definition) => {
    const recorded = states.find((state) => state.sourceId === definition.id);
    const declared = definition.defaultState ?? 'enabled';
    let state = ['disabled', 'not-configured'].includes(declared) ? declared : recorded?.state ?? declared;
    if (!STATES.has(state)) state = 'failed';
    const lastSuccessAt = typeof recorded?.lastSuccessAt === 'string' && Number.isFinite(Date.parse(recorded.lastSuccessAt))
      ? recorded.lastSuccessAt : null;
    const staleAfterMs = Number.isFinite(definition.staleAfterMs) && definition.staleAfterMs > 0 ? definition.staleAfterMs : null;
    const age = at - Date.parse(lastSuccessAt);
    // A previously healthy state must age out even if its poller has stopped.
    if (state === 'healthy' && (!lastSuccessAt || staleAfterMs === null || !Number.isFinite(age) || age < 0 || age >= staleAfterMs)) state = 'stale';
    return {
      sourceId: definition.id, label: definition.label ?? definition.id,
      provider: definition.provider ?? definition.id, state, lastSuccessAt, staleAfterMs,
      lastAttemptAt: typeof recorded?.lastAttemptAt === 'string' && Number.isFinite(Date.parse(recorded.lastAttemptAt)) ? recorded.lastAttemptAt : null,
      sourceWatermark: typeof recorded?.sourceWatermark === 'string' ? recorded.sourceWatermark : null,
      httpStatus: Number.isInteger(recorded?.httpStatus) ? recorded.httpStatus : null,
      latencyMs: Number.isFinite(recorded?.latencyMs) ? recorded.latencyMs : null,
      counts: Object.fromEntries(['fetched', 'accepted', 'rejected', 'created', 'updated', 'unchanged', 'resolved']
        .filter((key) => Number.isFinite(recorded?.counts?.[key])).map((key) => [key, recorded.counts[key]])),
      coverage: {
        countries: definition.coverage?.countries ?? [], regions: definition.coverage?.regions ?? [],
        kind: definition.coverage?.kind ?? 'unspecified',
      },
      disclosure: definition.disclosure ?? 'Only this source and its declared coverage are checked.',
    };
  });
  return {
    checkedAt, scope: 'source-network',
    // Feed health is not proof that every point or hazard on a route is covered.
    status: sources.some((source) => source.state === 'healthy') ? 'limited' : 'unavailable',
    sources,
  };
}
