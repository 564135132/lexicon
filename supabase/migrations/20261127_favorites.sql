-- 收藏单词：每个账号一份，随登录状态同步。
-- 在 Supabase Dashboard -> SQL Editor 执行一次即可（可重复执行）。

create table if not exists public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  word text not null check (char_length(word) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (user_id, word)
);

create index if not exists favorites_user_time_idx
  on public.favorites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 每个用户最多保留 500 条收藏
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

alter table public.favorites enable row level security;

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
-- Grants（RLS 仍会把每一行限制为本人）
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
revoke all on table public.favorites from anon;
grant select, insert, delete on table public.favorites to authenticated;
