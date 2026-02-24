create extension if not exists pgcrypto;

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

create index if not exists likes_post_id_idx on public.likes(post_id);
create index if not exists comments_post_id_idx on public.comments(post_id);

alter table public.post_images enable row level security;
alter table public.followers enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;

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

select pg_notify('pgrst', 'reload schema');
