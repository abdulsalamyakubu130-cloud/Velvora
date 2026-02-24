-- Compatibility migration for projects created before profile_picture_url existed.
-- Safe to run multiple times.

alter table public.users
  add column if not exists profile_picture_url text;

update public.users
set profile_picture_url = avatar_url
where profile_picture_url is null
  and avatar_url is not null;

