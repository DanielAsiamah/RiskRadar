import assert from 'node:assert/strict';
import test from 'node:test';
import { createWatchlistStore, normalizeWatchedPostcode } from './watchlist-store.mjs';

function createResponse(status, jsonBody) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return jsonBody;
    },
    async text() {
      return JSON.stringify(jsonBody);
    },
  };
}

function createStore(fetchImpl) {
  return createWatchlistStore({
    supabaseUrl: 'https://riskradar.supabase.co',
    supabaseServiceRoleKey: 'service-role',
  }, fetchImpl);
}

test('normalizeWatchedPostcode uppercases and restores a single outward space', () => {
  assert.equal(normalizeWatchedPostcode(' se108ep '), 'SE10 8EP');
  assert.equal(normalizeWatchedPostcode('br1 5nn'), 'BR1 5NN');
});

test('list filters by owner and returns camelCase rows', async () => {
  const calls = [];
  const store = createStore(async (input, init) => {
    calls.push({ input, init });
    return createResponse(200, [{
      id: 'watch-1',
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'Home',
      postcode: 'SE10 8EP',
      normalized_postcode: 'SE10 8EP',
      last_checked_month: '2026-05',
      last_snapshot: { score: 6 },
      created_at: '2026-08-12T10:00:00.000Z',
      updated_at: '2026-08-12T10:05:00.000Z',
    }]);
  });

  const rows = await store.list('123e4567-e89b-12d3-a456-426614174000');

  assert.match(calls[0].input, /user_id=eq\.123e4567-e89b-12d3-a456-426614174000/);
  assert.equal(rows[0].normalizedPostcode, 'SE10 8EP');
  assert.equal(rows[0].lastCheckedMonth, '2026-05');
  assert.deepEqual(rows[0].lastSnapshot, { score: 6 });
  assert.equal('normalized_postcode' in rows[0], false);
});

test('create validates labels before calling Supabase', async () => {
  let called = false;
  const store = createStore(async () => {
    called = true;
    return createResponse(201, []);
  });

  await assert.rejects(
    store.create('123e4567-e89b-12d3-a456-426614174000', {
      label: 'x'.repeat(41),
      postcode: 'SE10 8EP',
    }),
    (error) => error.code === 'INVALID_WATCH_LABEL',
  );

  assert.equal(called, false);
});

test('create translates duplicate and watch-limit Supabase failures', async () => {
  const responses = [
    createResponse(409, { code: '23505', message: 'duplicate key value violates unique constraint' }),
    createResponse(400, { message: 'WATCH_LIMIT_REACHED' }),
  ];
  const store = createStore(async () => responses.shift());

  await assert.rejects(
    store.create('123e4567-e89b-12d3-a456-426614174000', {
      label: 'Home',
      postcode: 'SE10 8EP',
    }),
    (error) => error.code === 'DUPLICATE_WATCH',
  );

  await assert.rejects(
    store.create('123e4567-e89b-12d3-a456-426614174000', {
      label: 'Work',
      postcode: 'BR1 5NN',
    }),
    (error) => error.code === 'WATCH_LIMIT_REACHED',
  );
});

test('update and remove require a watch id', async () => {
  const store = createStore(async () => createResponse(200, []));

  await assert.rejects(
    store.update('123e4567-e89b-12d3-a456-426614174000', '', { label: 'Renamed' }),
    (error) => error.code === 'WATCH_NOT_FOUND',
  );

  await assert.rejects(
    store.remove('123e4567-e89b-12d3-a456-426614174000', ''),
    (error) => error.code === 'WATCH_NOT_FOUND',
  );
});

test('saveSnapshot persists the latest data month and snapshot for the owner row', async () => {
  const calls = [];
  const store = createStore(async (input, init) => {
    calls.push({ input, init });
    return createResponse(200, [{
      id: 'watch-1',
      user_id: '123e4567-e89b-12d3-a456-426614174000',
      label: 'Home',
      postcode: 'SE10 8EP',
      normalized_postcode: 'SE10 8EP',
      last_checked_month: '2026-05',
      last_snapshot: { score: 6 },
      created_at: '2026-08-12T10:00:00.000Z',
      updated_at: '2026-08-12T10:05:00.000Z',
    }]);
  });

  const watchedPlace = await store.saveSnapshot('123e4567-e89b-12d3-a456-426614174000', 'watch-1', {
    dataMonth: '2026-05',
    snapshot: { score: 6 },
  });

  assert.equal(calls[0].init.method, 'PATCH');
  assert.match(calls[0].input, /id=eq\.watch-1/);
  assert.match(calls[0].input, /user_id=eq\.123e4567-e89b-12d3-a456-426614174000/);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    last_checked_month: '2026-05',
    last_snapshot: { score: 6 },
  });
  assert.equal(watchedPlace.lastCheckedMonth, '2026-05');
});
