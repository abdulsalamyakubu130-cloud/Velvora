-- Query performance indexes for high-traffic screens.
-- Safe to run multiple times.

create index if not exists followers_follower_id_idx
  on public.followers(follower_id);

create index if not exists followers_following_id_idx
  on public.followers(following_id);

create index if not exists post_images_post_id_idx
  on public.post_images(post_id);

create index if not exists posts_user_id_created_at_idx
  on public.posts(user_id, created_at desc);

create index if not exists comments_post_id_created_at_idx
  on public.comments(post_id, created_at desc);

create index if not exists likes_post_id_created_at_idx
  on public.likes(post_id, created_at desc);

