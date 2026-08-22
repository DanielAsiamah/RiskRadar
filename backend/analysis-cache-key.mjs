const ANALYSIS_RESPONSE_SCHEMA_VERSION = 'freshness-spike-v6';

export function buildAnalysisCacheStorageKey(scoreModelId, cacheKey) {
  return `${scoreModelId}:${ANALYSIS_RESPONSE_SCHEMA_VERSION}:${cacheKey}`;
}

export function isCurrentAnalysisCacheStorageKey(storageKey, scoreModelId, cacheKey) {
  return storageKey === buildAnalysisCacheStorageKey(scoreModelId, cacheKey);
}
