create table public.alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_email_enabled boolean not null default true,
  category_change_enabled boolean not null default true,
  volume_change_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.alert_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  watched_place_id uuid not null references public.watched_places(id) on delete cascade,
  data_month text not null,
  status text not null check (status in ('pending', 'sent', 'failed', 'skipped')),
  change_summary jsonb not null default '{}'::jsonb,
  provider_id text,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, watched_place_id, data_month)
);

create trigger set_alert_preferences_updated_at
before update on public.alert_preferences
for each row execute procedure public.set_updated_at();

create trigger set_alert_runs_updated_at
before update on public.alert_runs
for each row execute procedure public.set_updated_at();

alter table public.alert_preferences enable row level security;
alter table public.alert_runs enable row level security;

create policy "alert_preferences_select_own"
on public.alert_preferences
for select
to authenticated
using (auth.uid() = user_id);

create policy "alert_preferences_insert_own"
on public.alert_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "alert_preferences_update_own"
on public.alert_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
