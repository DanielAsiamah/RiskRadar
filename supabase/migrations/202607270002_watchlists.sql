create table public.watched_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 40),
  postcode text not null,
  normalized_postcode text not null,
  last_checked_month text,
  last_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, normalized_postcode)
);

create or replace function public.enforce_watch_limit()
returns trigger
language plpgsql
as $$
begin
  if (
    select count(*)
    from public.watched_places
    where user_id = new.user_id
  ) >= 10 then
    raise exception 'WATCH_LIMIT_REACHED';
  end if;

  return new;
end;
$$;

create trigger enforce_watch_limit_before_insert
before insert on public.watched_places
for each row execute procedure public.enforce_watch_limit();

create trigger set_watched_places_updated_at
before update on public.watched_places
for each row execute procedure public.set_updated_at();

alter table public.watched_places enable row level security;

create policy "watched_places_select_own"
on public.watched_places
for select
to authenticated
using (auth.uid() = user_id);

create policy "watched_places_insert_own"
on public.watched_places
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "watched_places_update_own"
on public.watched_places
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "watched_places_delete_own"
on public.watched_places
for delete
to authenticated
using (auth.uid() = user_id);
