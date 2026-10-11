import assert from 'node:assert/strict';
import test from 'node:test';
import { localApiEnvironment } from './local-api-config.mjs';

test('local launcher explicitly binds loopback and selects real routing', () => {
  const env = localApiEnvironment({ HOST: '0.0.0.0', ROUTE_PROVIDER: 'mock', PORT: '3002', UNRELATED: 'retained' });
  assert.equal(env.HOST, '127.0.0.1');
  assert.equal(env.PORT, '3002');
  assert.equal(env.NODE_ENV, 'development');
  assert.equal(env.ROUTE_GUARD_LOCAL_DEVELOPMENT, 'true');
  assert.equal(env.ROUTE_PROVIDER, 'free-osm');
  assert.equal(env.UNRELATED, 'retained');
  assert.equal(localApiEnvironment({}).PORT, '3001');
});

test('local launcher refuses production and invalid ports', () => {
  assert.throws(() => localApiEnvironment({ NODE_ENV: 'production' }), /production/);
  for (const PORT of ['0', '99999', '-1', 'not-a-port']) {
    assert.throws(() => localApiEnvironment({ PORT }), /PORT/);
  }
});
