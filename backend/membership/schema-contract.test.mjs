import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredFragments = [
  'create table public.profiles',
  'create table public.subscriptions',
  'create table public.billing_events',
  'alter table public.profiles enable row level security',
  'alter table public.subscriptions enable row level security',
  'stripe_event_id text primary key',
  'on auth.users',
];

test('membership migration defines the required schema contract', async () => {
  const migration = await readFile('supabase/migrations/202607270001_membership.sql', 'utf8');

  for (const fragment of requiredFragments) {
    assert.match(migration.toLowerCase(), new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});
