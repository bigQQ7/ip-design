-- 可自定义的分类（亮点、主特征、风格、物种），管理员在网站上新建或删除
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  dim        text not null check (dim in ('hl','feature','style','species')),
  name       text not null,
  sort       int not null default 0,
  created_at timestamptz not null default now(),
  unique (dim, name)
);
alter table public.categories enable row level security;
drop policy if exists "cats read" on public.categories;
create policy "cats read" on public.categories for select to authenticated using (public.is_member());
drop policy if exists "cats admin write" on public.categories;
create policy "cats admin write" on public.categories for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.categories (dim, name, sort)
select d, n, o from (values
  ('hl','五官表情',0),('hl','剪影',1),('hl','融合创意',2),('hl','配色',3),('hl','比例体型',4),
  ('feature','耳朵',0),('feature','头型',1),('feature','帽子/头饰',2),('feature','头顶元素',3),('feature','尾巴',4),
  ('feature','嘴',5),('feature','角',6),('feature','表情',7),('feature','体型',8),('feature','发型',9),
  ('style','3D软胶',0),('style','2D平面',1),('style','娃系',2),
  ('species','兔',0),('species','猫',1),('species','熊',2),('species','狗',3),('species','考拉',4),
  ('species','狐狸',5),('species','羊',6),('species','鸭',7),('species','小怪',8),('species','蘑菇',9)
) as v(d, n, o)
on conflict (dim, name) do nothing;
