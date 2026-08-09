import assert from 'node:assert/strict';
import test from 'node:test';

import { createRouteGuardRouteHandler } from './route-guard.mjs';

function createRequest(body, method = 'POST') {
  const chunks = body == null ? [] : [Buffer.from(JSON.stringify(body))];
  return {
    method,
    [Symbol.asyncIterator]: async function* () {
      yield* chunks;
    },
  };
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

const validBody = {
  start: 'SE10 8EP',
  destination: 'London Bridge',
  travelMode: 'transit',
  entitlement: 'pro',
  routeScansUsed: 4,
};

test('POST /api/route-guard returns a mock route scan', async () => {
  const handler = createRouteGuardRouteHandler();
  const response = createResponse();

  const handled = await handler.handle(
    createRequest(validBody),
    response,
    new URL('http://localhost/api/route-guard'),
  );

  const payload = JSON.parse(response.body);
  assert.equal(handled, true);
  assert.equal(response.statusCode, 200);
  assert.match(response.headers['Content-Type'], /application\/json/);
  assert.equal(payload.provider, 'mock');
  assert.equal(payload.googleRequestMade, false);
  assert.equal(payload.usage.usedAfter, 5);
});

test('POST /api/route-guard returns structured entitlement and limit errors', async () => {
  const handler = createRouteGuardRouteHandler();

  const freeResponse = createResponse();
  await handler.handle(
    createRequest({ ...validBody, entitlement: 'free' }),
    freeResponse,
    new URL('http://localhost/api/route-guard'),
  );
  assert.equal(freeResponse.statusCode, 403);
  assert.equal(JSON.parse(freeResponse.body).code, 'PREMIUM_REQUIRED');

  const limitResponse = createResponse();
  await handler.handle(
    createRequest({ ...validBody, routeScansUsed: 100 }),
    limitResponse,
    new URL('http://localhost/api/route-guard'),
  );
  assert.equal(limitResponse.statusCode, 429);
  assert.equal(JSON.parse(limitResponse.body).code, 'ROUTE_SCAN_LIMIT_REACHED');
});

test('route guard handler ignores other routes and rejects invalid JSON', async () => {
  const handler = createRouteGuardRouteHandler();
  const ignoredResponse = createResponse();
  const ignored = await handler.handle(
    createRequest(validBody, 'GET'),
    ignoredResponse,
    new URL('http://localhost/api/route-guard'),
  );
  assert.equal(ignored, false);

  const invalidRequest = {
    method: 'POST',
    [Symbol.asyncIterator]: async function* () {
      yield Buffer.from('{not json');
    },
  };
  const invalidResponse = createResponse();
  await handler.handle(invalidRequest, invalidResponse, new URL('http://localhost/api/route-guard'));
  assert.equal(invalidResponse.statusCode, 400);
  assert.equal(JSON.parse(invalidResponse.body).code, 'INVALID_ROUTE_GUARD_INPUT');
});
