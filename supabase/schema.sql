-- Lexicon account and cloud sync schema.
-- Run this whole file once in the Supabase Dashboard -> SQL Editor.
-- Before using guest login, enable Authentication -> Providers -> Anonymous sign-ins.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  is_guest boolean not null default false,
  display_name text,
  avatar_data text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists avatar_data text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_display_name_length'
  ) then
    alter table public.profiles
      add constraint profiles_display_name_length
      check (display_name is null or char_length(display_name) between 1 and 24);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_size'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_size
      check (avatar_data is null or char_length(avatar_data) <= 400000);
  end if;
end;
$$;

create table if not exists public.search_history (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null check (char_length(word) between 1 and 100),
  searched_at timestamptz not null default now(),
  primary key (user_id, word)
);

create index if not exists search_history_user_time_idx
  on public.search_history (user_id, searched_at desc);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  selected_background_ids text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null check (char_length(word) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, word)
);

create index if not exists favorites_user_time_idx
  on public.favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Profile bootstrap for email and anonymous users
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, is_guest)
  values (
    new.id,
    new.email,
    coalesce((to_jsonb(new) ->> 'is_anonymous')::boolean, new.email is null)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for users created before this schema was installed.
insert into public.profiles (id, email, is_guest)
select
  u.id,
  u.email,
  coalesce((to_jsonb(u) ->> 'is_anonymous')::boolean, u.email is null)
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Keep at most 100 history rows per user
-- ---------------------------------------------------------------------------

create or replace function public.trim_search_history_rows()
returns trigger
language plpgsql
as $$
begin
  delete from public.search_history
  where user_id = new.user_id
    and word not in (
      select word
      from public.search_history
      where user_id = new.user_id
      order by searched_at desc
      limit 100
    );
  return null;
end;
$$;

drop trigger if exists trim_search_history_after_write on public.search_history;
create trigger trim_search_history_after_write
  after insert or update of searched_at on public.search_history
  for each row execute function public.trim_search_history_rows();

-- ---------------------------------------------------------------------------
-- Keep at most 500 favorites per user
-- ---------------------------------------------------------------------------

create or replace function public.trim_favorites_rows()
returns trigger
language plpgsql
as $$
begin
  delete from public.favorites
  where user_id = new.user_id
    and word not in (
      select word
      from public.favorites
      where user_id = new.user_id
      order by created_at desc
      limit 500
    );
  return null;
end;
$$;

drop trigger if exists trim_favorites_after_write on public.favorites;
create trigger trim_favorites_after_write
  after insert on public.favorites
  for each row execute function public.trim_favorites_rows();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.search_history enable row level security;
alter table public.user_settings enable row level security;
alter table public.favorites enable row level security;

drop policy if exists "profiles select own" on public.profiles;
create policy "profiles select own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "history select own" on public.search_history;
create policy "history select own"
  on public.search_history for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "history insert own" on public.search_history;
create policy "history insert own"
  on public.search_history for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "history update own" on public.search_history;
create policy "history update own"
  on public.search_history for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "history delete own" on public.search_history;
create policy "history delete own"
  on public.search_history for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "settings select own" on public.user_settings;
create policy "settings select own"
  on public.user_settings for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "settings insert own" on public.user_settings;
create policy "settings insert own"
  on public.user_settings for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "settings update own" on public.user_settings;
create policy "settings update own"
  on public.user_settings for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "settings delete own" on public.user_settings;
create policy "settings delete own"
  on public.user_settings for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "favorites select own" on public.favorites;
create policy "favorites select own"
  on public.favorites for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "favorites insert own" on public.favorites;
create policy "favorites insert own"
  on public.favorites for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "favorites delete own" on public.favorites;
create policy "favorites delete own"
  on public.favorites for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants (RLS still restricts every row to its owner)
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;
revoke all on table public.profiles from anon;
revoke all on table public.search_history from anon;
revoke all on table public.user_settings from anon;
revoke all on table public.favorites from anon;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.search_history to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, insert, delete on table public.favorites to authenticated;
