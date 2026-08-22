import assert from 'node:assert/strict';
import test from 'node:test';

import { buildAnalysisCacheStorageKey, isCurrentAnalysisCacheStorageKey } from './analysis-cache-key.mjs';

const scoreModelId = 'uk-local-pressure-v3';
const queryKey = '{"type":"postcode","query":"SE10 8EP"}';

test('does not reuse the pre-spike v5 analysis response cache key', () => {
  const oldStorageKey = `${scoreModelId}:structured-risk-evidence-v5:${queryKey}`;

  assert.equal(isCurrentAnalysisCacheStorageKey(oldStorageKey, scoreModelId, queryKey), false);
  assert.notEqual(buildAnalysisCacheStorageKey(scoreModelId, queryKey), oldStorageKey);
});

test('recognises only the current model and response-schema cache key', () => {
  const currentStorageKey = buildAnalysisCacheStorageKey(scoreModelId, queryKey);

  assert.equal(isCurrentAnalysisCacheStorageKey(currentStorageKey, scoreModelId, queryKey), true);
  assert.equal(isCurrentAnalysisCacheStorageKey(currentStorageKey, 'another-model', queryKey), false);
  assert.equal(isCurrentAnalysisCacheStorageKey(currentStorageKey, scoreModelId, '{"type":"postcode","query":"BR1 5NN"}'), false);
});
