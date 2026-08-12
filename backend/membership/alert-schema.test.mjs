import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const requiredFragments = [
  'create table public.alert_preferences',
  'monthly_email_enabled boolean not null default true',
  'category_change_enabled boolean not null default true',
  'volume_change_enabled boolean not null default true',
  'create table public.alert_runs',
  'unique (user_id, watched_place_id, data_month)',
  "check (status in ('pending', 'sent', 'failed', 'skipped'))",
  'change_summary jsonb',
  'provider_id text',
  'alter table public.alert_preferences enable row level security',
  'alter table public.alert_runs enable row level security',
  'create policy "alert_preferences_select_own"',
  'create policy "alert_preferences_insert_own"',
  'create policy "alert_preferences_update_own"',
  'create trigger set_alert_preferences_updated_at',
  'create trigger set_alert_runs_updated_at',
];

test('alert migration defines member preferences and backend-only delivery history', async () => {
  const migration = await readFile('supabase/migrations/202607270003_alerts.sql', 'utf8');

  for (const fragment of requiredFragments) {
    assert.match(migration.toLowerCase(), new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.doesNotMatch(migration.toLowerCase(), /create policy "alert_runs_/);
});
