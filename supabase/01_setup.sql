-- =============================================================
-- IP 造型诊断台：数据库初始化
-- 在 Supabase 后台 → SQL Editor 中整段粘贴运行一次。
-- 运行前，先把下面「管理员邮箱」那一行改成你自己的邮箱。
-- =============================================================

-- 1. 管理员名单（只有这里的邮箱会成为管理员）
create table if not exists public.admin_emails (
  email    text primary key,
  username text unique not null
);
alter table public.admin_emails enable row level security;   -- 不开放任何直接读写

insert into public.admin_emails (email, username)
values ('请改成你的邮箱@example.com', 'bigqq7')               -- ← 改这里
on conflict (email) do update set username = excluded.username;

-- 2. 邀请名单
create table if not exists public.invites (
  email      text primary key,
  invited_at timestamptz not null default now()
);
alter table public.invites enable row level security;

-- 3. 成员资料
create table if not exists public.profiles (
  id           uuid primary key references auth.users on delete cascade,
  email        text unique,
  username     text unique,
  role         text not null default 'student' check (role in ('admin','student','blocked')),
  password_set boolean not null default false,
  created_at   timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- 4. 达标案例
create table if not exists public.refs (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text not null,
  species     text default '',
  feature_cat text default '',
  feature     text default '',
  fusion      text default '',
  colors      text default '',
  style       text default '',
  mood        text default '',
  learn       text default '',
  highlights  text[] not null default '{}',
  image_path  text not null,
  is_base     boolean not null default false,
  from_user   uuid references auth.users on delete set null,
  note        text default '',
  created_at  timestamptz not null default now()
);
alter table public.refs enable row level security;

-- 5. 学生推荐
create table if not exists public.submissions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade default auth.uid(),
  image_path  text not null,
  note        text default '',
  src         text default '',
  status      text not null default 'pending' check (status in ('pending','approved','rejected')),
  reason      text default '',
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
alter table public.submissions enable row level security;

-- ---------- 辅助函数 ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role in ('admin','student'));
$$;

-- 登录时用「用户名」换取邮箱
create or replace function public.email_for_username(u text) returns text
language sql stable security definer set search_path = public as $$
  select email from profiles where lower(username) = lower(trim(u)) and role <> 'blocked' limit 1;
$$;
grant execute on function public.email_for_username(text) to anon, authenticated;

-- 没有被邀请的邮箱不能注册
create or replace function public.check_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from admin_emails where lower(email) = lower(new.email))
     or exists (select 1 from invites where lower(email) = lower(new.email)) then
    return new;
  end if;
  raise exception '这个邮箱还没有被邀请';
end;
$$;
drop trigger if exists before_user_created on auth.users;
create trigger before_user_created before insert on auth.users
  for each row execute function public.check_invite();

-- 新成员自动建立资料
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare a admin_emails%rowtype;
begin
  select * into a from admin_emails where lower(email) = lower(new.email);
  insert into profiles (id, email, username, role, password_set)
  values (new.id, lower(new.email), a.username,
          case when a.email is not null then 'admin' else 'student' end,
          false)
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 成员设置好密码后打标记
create or replace function public.mark_password_set() returns void
language sql security definer set search_path = public as $$
  update profiles set password_set = true where id = auth.uid();
$$;
grant execute on function public.mark_password_set() to authenticated;

-- ---------- 访问规则 ----------
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "invites admin" on public.invites;
create policy "invites admin" on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "refs read" on public.refs;
create policy "refs read" on public.refs for select to authenticated using (public.is_member());
drop policy if exists "refs admin write" on public.refs;
create policy "refs admin write" on public.refs for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "subs read" on public.submissions;
create policy "subs read" on public.submissions for select to authenticated
  using ((user_id = auth.uid() and public.is_member()) or public.is_admin());
drop policy if exists "subs insert own" on public.submissions;
create policy "subs insert own" on public.submissions for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and public.is_member());
drop policy if exists "subs delete own pending" on public.submissions;
create policy "subs delete own pending" on public.submissions for delete to authenticated
  using ((user_id = auth.uid() and status = 'pending') or public.is_admin());
drop policy if exists "subs admin update" on public.submissions;
create policy "subs admin update" on public.submissions for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------- 图片存储（私有，只有成员能看） ----------
insert into storage.buckets (id, name, public) values ('images', 'images', false)
on conflict (id) do nothing;

drop policy if exists "images read" on storage.objects;
create policy "images read" on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.is_member());
drop policy if exists "images upload" on storage.objects;
create policy "images upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (
    public.is_admin()
    or (public.is_member() and (storage.foldername(name))[1] = 'subs'
        and (storage.foldername(name))[2] = auth.uid()::text)));
drop policy if exists "images admin update" on storage.objects;
create policy "images admin update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and public.is_admin());
drop policy if exists "images delete" on storage.objects;
create policy "images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (public.is_admin()
    or ((storage.foldername(name))[1] = 'subs' and (storage.foldername(name))[2] = auth.uid()::text)));
