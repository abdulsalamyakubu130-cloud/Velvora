create extension if not exists pgcrypto;
create extension if not exists citext;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'post_condition') then
    create type public.post_condition as enum ('new', 'used');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notification_type') then
    create type public.notification_type as enum ('like', 'comment', 'follow', 'message', 'mention');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'verification_tier') then
    create type public.verification_tier as enum ('none', 'basic', 'enhanced');
  end if;
end $$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  full_name text not null default '',
  bio text not null default '',
  country text not null default '',
  email citext,
  phone_number text,
  avatar_url text,
  profile_picture_url text,
  is_verified boolean not null default false,
  verification_tier public.verification_tier not null default 'none',
  created_at timestamptz not null default now()
);

alter table public.users add column if not exists email citext;
alter table public.users add column if not exists phone_number text;
alter table public.users add column if not exists profile_picture_url text;
alter table public.users add column if not exists verification_tier public.verification_tier not null default 'none';

create unique index if not exists users_email_unique_idx
  on public.users(email)
  where email is not null;

create unique index if not exists users_phone_unique_idx
  on public.users(phone_number)
  where phone_number is not null;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null,
  price numeric(12, 2) not null check (price >= 0),
  category_id uuid references public.categories(id) on delete set null,
  condition public.post_condition not null default 'used',
  location text not null,
  is_available boolean not null default true,
  is_negotiable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  image_url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.followers (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, post_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  content text not null check (char_length(content) > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_one uuid not null references public.users(id) on delete cascade,
  user_two uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (user_one <> user_two)
);

create unique index if not exists conversations_pair_unique_idx
  on public.conversations (least(user_one, user_two), greatest(user_one, user_two));

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  content text,
  image_url text,
  created_at timestamptz not null default now(),
  is_seen boolean not null default false,
  check (content is not null or image_url is not null)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type public.notification_type not null,
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reported_by uuid not null references public.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  user_id uuid references public.users(id) on delete set null,
  reason text not null,
  created_at timestamptz not null default now(),
  check (post_id is not null or user_id is not null)
);

create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.users(id) on delete cascade,
  blocked_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

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

create index if not exists posts_user_id_idx on public.posts(user_id);
create index if not exists posts_created_at_idx on public.posts(created_at desc);
create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists comments_post_id_idx on public.comments(post_id);
create index if not exists messages_conversation_id_idx on public.messages(conversation_id);
create index if not exists notifications_user_id_idx on public.notifications(user_id);
create index if not exists reports_created_at_idx on public.reports(created_at desc);
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

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, username, full_name, email, phone_number, country, profile_picture_url, avatar_url)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'username', ''),
      'user_' || substring(new.id::text, 1, 8)
    ),
    coalesce(new.raw_user_meta_data->>'full_name', '')
    ,
    nullif(coalesce(new.email, new.raw_user_meta_data->>'email'), ''),
    nullif(coalesce(new.phone, new.raw_user_meta_data->>'phone'), ''),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Nigeria'),
    nullif(
      coalesce(
        new.raw_user_meta_data->>'profile_picture_url',
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
      ),
      ''
    ),
    nullif(
      coalesce(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'profile_picture_url',
        new.raw_user_meta_data->>'picture'
      ),
      ''
    )
  )
  on conflict (id) do update
  set
    email = coalesce(excluded.email, users.email),
    phone_number = coalesce(excluded.phone_number, users.phone_number),
    profile_picture_url = coalesce(excluded.profile_picture_url, excluded.avatar_url, users.profile_picture_url, users.avatar_url),
    avatar_url = coalesce(excluded.avatar_url, excluded.profile_picture_url, users.avatar_url, users.profile_picture_url),
    country = case
      when coalesce(users.country, '') = '' then excluded.country
      else users.country
    end,
    full_name = case
      when users.full_name = '' then excluded.full_name
      else users.full_name
    end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, phone, raw_user_meta_data on auth.users
for each row execute procedure public.handle_new_user();

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.posts enable row level security;
alter table public.post_images enable row level security;
alter table public.followers enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.blocked_users enable row level security;
alter table public.kyc_verifications enable row level security;

drop policy if exists users_read_all on public.users;
create policy users_read_all on public.users
for select using (true);

drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
for insert with check (auth.uid() = id);

drop policy if exists users_update_own_without_verify on public.users;
create policy users_update_own_without_verify on public.users
for update
using (auth.uid() = id)
with check (
  auth.uid() = id
  and is_verified = (select u.is_verified from public.users u where u.id = auth.uid())
  and verification_tier = (select u.verification_tier from public.users u where u.id = auth.uid())
);

drop policy if exists users_admin_verify on public.users;
create policy users_admin_verify on public.users
for update
using ((auth.jwt() ->> 'role') = 'admin')
with check ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists categories_read_all on public.categories;
create policy categories_read_all on public.categories
for select using (true);

drop policy if exists posts_read_all on public.posts;
create policy posts_read_all on public.posts
for select using (true);

drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts
for insert with check (auth.uid() = user_id);

drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists posts_delete_own on public.posts;
create policy posts_delete_own on public.posts
for delete using (auth.uid() = user_id);

drop policy if exists post_images_read_all on public.post_images;
create policy post_images_read_all on public.post_images
for select using (true);

drop policy if exists post_images_write_post_owner on public.post_images;
create policy post_images_write_post_owner on public.post_images
for all
using (
  exists (
    select 1 from public.posts p
    where p.id = post_images.post_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.posts p
    where p.id = post_images.post_id and p.user_id = auth.uid()
  )
);

drop policy if exists followers_read_all on public.followers;
create policy followers_read_all on public.followers
for select using (true);

drop policy if exists followers_insert_own on public.followers;
create policy followers_insert_own on public.followers
for insert with check (auth.uid() = follower_id and follower_id <> following_id);

drop policy if exists followers_delete_own on public.followers;
create policy followers_delete_own on public.followers
for delete using (auth.uid() = follower_id);

drop policy if exists likes_read_all on public.likes;
create policy likes_read_all on public.likes
for select using (true);

drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
for insert with check (auth.uid() = user_id);

drop policy if exists likes_delete_own on public.likes;
create policy likes_delete_own on public.likes
for delete using (auth.uid() = user_id);

drop policy if exists comments_read_all on public.comments;
create policy comments_read_all on public.comments
for select using (true);

drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
for insert with check (auth.uid() = user_id);

drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists comments_delete_own on public.comments;
create policy comments_delete_own on public.comments
for delete using (auth.uid() = user_id);

drop policy if exists conversations_participant_only on public.conversations;
create policy conversations_participant_only on public.conversations
for all
using (auth.uid() in (user_one, user_two))
with check (auth.uid() in (user_one, user_two));

drop policy if exists messages_participant_read on public.messages;
create policy messages_participant_read on public.messages
for select
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and auth.uid() in (c.user_one, c.user_two)
  )
);

drop policy if exists messages_participant_insert on public.messages;
create policy messages_participant_insert on public.messages
for insert
with check (
  sender_id = auth.uid()
  and exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and auth.uid() in (c.user_one, c.user_two)
  )
);

drop policy if exists messages_participant_update on public.messages;
create policy messages_participant_update on public.messages
for update
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and auth.uid() in (c.user_one, c.user_two)
  )
)
with check (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and auth.uid() in (c.user_one, c.user_two)
  )
);

drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications
for select using (auth.uid() = user_id);

drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications
for insert with check (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
for insert with check (auth.uid() = reported_by);

drop policy if exists reports_read_own_or_admin on public.reports;
create policy reports_read_own_or_admin on public.reports
for select using (auth.uid() = reported_by or (auth.jwt() ->> 'role') = 'admin');

drop policy if exists blocked_users_read_own on public.blocked_users;
create policy blocked_users_read_own on public.blocked_users
for select using (auth.uid() = blocker_id);

drop policy if exists blocked_users_insert_own on public.blocked_users;
create policy blocked_users_insert_own on public.blocked_users
for insert with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists blocked_users_delete_own on public.blocked_users;
create policy blocked_users_delete_own on public.blocked_users
for delete using (auth.uid() = blocker_id);

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
