-- Adds the avatar and display name used by the account panel.
-- Run this once if supabase/schema.sql was already applied before this feature.

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

drop policy if exists "profiles insert own" on public.profiles;
create policy "profiles insert own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

grant select, insert, update on table public.profiles to authenticated;
