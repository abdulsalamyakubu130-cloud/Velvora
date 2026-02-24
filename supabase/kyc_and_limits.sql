do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_tier') then
    create type public.verification_tier as enum ('none', 'basic', 'enhanced');
  end if;
end $$;

alter table public.users
  add column if not exists verification_tier public.verification_tier not null default 'none';

create table if not exists public.kyc_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tier_requested public.verification_tier not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  document_type text not null default 'national_id',
  document_url text,
  notes text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tier_requested)
);

create index if not exists kyc_verifications_user_id_idx on public.kyc_verifications(user_id);
create index if not exists kyc_verifications_status_idx on public.kyc_verifications(status, created_at desc);

create or replace function public.enforce_unverified_post_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  seller_verified boolean := false;
  seller_tier public.verification_tier := 'none';
  active_listing_count integer := 0;
begin
  select coalesce(u.is_verified, false), coalesce(u.verification_tier, 'none'::public.verification_tier)
  into seller_verified, seller_tier
  from public.users u
  where u.id = new.user_id;

  if seller_verified or seller_tier in ('basic', 'enhanced') then
    return new;
  end if;

  select count(*)
  into active_listing_count
  from public.posts p
  where p.user_id = new.user_id
    and p.is_available = true;

  if active_listing_count >= 3 then
    raise exception 'Complete seller verification to publish more than 3 active listings.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_posts_insert_unverified_limit on public.posts;
create trigger before_posts_insert_unverified_limit
before insert on public.posts
for each row execute procedure public.enforce_unverified_post_limit();

alter table public.kyc_verifications enable row level security;

drop policy if exists users_update_own_without_verify on public.users;
create policy users_update_own_without_verify on public.users
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and is_verified = (select u.is_verified from public.users u where u.id = auth.uid())
  and verification_tier = (select u.verification_tier from public.users u where u.id = auth.uid())
);

drop policy if exists kyc_read_own on public.kyc_verifications;
create policy kyc_read_own on public.kyc_verifications
for select using (auth.uid() = user_id);

drop policy if exists kyc_insert_own on public.kyc_verifications;
create policy kyc_insert_own on public.kyc_verifications
for insert with check (
  auth.uid() = user_id
  and tier_requested in ('basic', 'enhanced')
);

drop policy if exists kyc_update_own_pending_only on public.kyc_verifications;
create policy kyc_update_own_pending_only on public.kyc_verifications
for update
using (auth.uid() = user_id and status = 'pending')
with check (
  auth.uid() = user_id
  and status = 'pending'
  and reviewed_by is null
  and reviewed_at is null
);

drop policy if exists kyc_admin_review on public.kyc_verifications;
create policy kyc_admin_review on public.kyc_verifications
for update
using ((auth.jwt() ->> 'role') = 'admin')
with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists kyc_admin_read on public.kyc_verifications;
create policy kyc_admin_read on public.kyc_verifications
for select using ((auth.jwt() ->> 'role') = 'admin');
