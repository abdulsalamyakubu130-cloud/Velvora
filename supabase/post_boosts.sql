create table if not exists public.post_boost_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  plan_id text not null check (plan_id in ('starter_3d', 'pro_7d', 'premium_7d')),
  boost_tier text not null check (boost_tier in ('starter', 'standard', 'premium')),
  amount_ngn integer not null check (amount_ngn > 0),
  duration_days integer not null check (duration_days in (3, 7)),
  payment_reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected', 'expired', 'cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'active' and starts_at is not null and ends_at is not null) or status <> 'active')
);

create index if not exists post_boost_orders_user_idx on public.post_boost_orders(user_id, created_at desc);
create index if not exists post_boost_orders_post_idx on public.post_boost_orders(post_id, created_at desc);
create index if not exists post_boost_orders_status_idx on public.post_boost_orders(status, ends_at desc);

create or replace function public.touch_post_boost_order_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_post_boost_order_update_touch on public.post_boost_orders;
create trigger before_post_boost_order_update_touch
before update on public.post_boost_orders
for each row execute procedure public.touch_post_boost_order_updated_at();

create or replace function public.is_marketplace_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  profile_email text := '';
  effective_email text := '';
  support_admin_fn_exists boolean := to_regprocedure('public.is_support_admin()') is not null;
  support_admin_result boolean := false;
begin
  select lower(trim(coalesce(u.email::text, '')))
  into profile_email
  from public.users u
  where u.id = auth.uid();

  effective_email := coalesce(nullif(claim_email, ''), nullif(profile_email, ''), '');

  if support_admin_fn_exists then
    begin
      support_admin_result := public.is_support_admin();
    exception
      when others then
        support_admin_result := false;
    end;
  end if;

  return (
    support_admin_result
    or
    (auth.jwt() ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    or effective_email = 'velvora278@gmail.com'
    or effective_email = 'yakubuabdulsalam24434@gmail.com'
  );
end;
$$;

grant execute on function public.is_marketplace_admin() to anon, authenticated;

alter table public.post_boost_orders enable row level security;

drop policy if exists post_boost_orders_select on public.post_boost_orders;
create policy post_boost_orders_select on public.post_boost_orders
for select using (
  (
    status = 'active'
    and coalesce(ends_at, now()) > now()
  )
  or auth.uid() = user_id
  or public.is_marketplace_admin()
);

drop policy if exists post_boost_orders_insert_own on public.post_boost_orders;
create policy post_boost_orders_insert_own on public.post_boost_orders
for insert with check (
  auth.uid() = user_id
  and status = 'pending'
  and starts_at is null
  and ends_at is null
  and exists (
    select 1
    from public.posts p
    where p.id = post_boost_orders.post_id
      and p.user_id = auth.uid()
  )
);

drop policy if exists post_boost_orders_update_admin on public.post_boost_orders;
create policy post_boost_orders_update_admin on public.post_boost_orders
for update
using (public.is_marketplace_admin())
with check (public.is_marketplace_admin());

drop policy if exists post_boost_orders_delete_own_pending_or_admin on public.post_boost_orders;
create policy post_boost_orders_delete_own_pending_or_admin on public.post_boost_orders
for delete using (
  public.is_marketplace_admin()
  or (auth.uid() = user_id and status = 'pending')
);

notify pgrst, 'reload schema';
