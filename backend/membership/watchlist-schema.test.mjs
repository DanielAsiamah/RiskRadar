import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredFragments = [
  'create table public.watched_places',
  'unique (user_id, normalized_postcode)',
  'create or replace function public.enforce_watch_limit()',
  'watch_limit_reached',
  'before insert on public.watched_places',
  'alter table public.watched_places enable row level security',
  'create policy "watched_places_select_own"',
  'create policy "watched_places_insert_own"',
  'create policy "watched_places_update_own"',
  'create policy "watched_places_delete_own"',
];

test('watchlist migration defines the required schema contract', async () => {
  const migration = await readFile('supabase/migrations/202607270002_watchlists.sql', 'utf8');

  for (const fragment of requiredFragments) {
    assert.match(migration.toLowerCase(), new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
