-- Cleanup broken/stale profile_picture_url values so real public URLs can be used.
-- Safe to run multiple times.

alter table public.users add column if not exists profile_picture_url text;

update public.users
set profile_picture_url = null
where lower(coalesce(profile_picture_url, '')) in ('null', 'undefined')
  or lower(profile_picture_url) like 'blob:%'
  or lower(profile_picture_url) like 'data:%'
  or lower(profile_picture_url) like '/placeholders/%';

-- If profile_picture_url is a signed URL token and avatar_url is present, prefer avatar_url.
update public.users
set profile_picture_url = avatar_url
where coalesce(profile_picture_url, '') <> ''
  and coalesce(avatar_url, '') <> ''
  and lower(profile_picture_url) like '%/storage/v1/object/sign/%'
  and lower(avatar_url) not like '%/storage/v1/object/sign/%';

-- Ensure avatar_url keeps a usable value where possible.
update public.users
set avatar_url = profile_picture_url
where coalesce(avatar_url, '') = ''
  and coalesce(profile_picture_url, '') <> '';

select pg_notify('pgrst', 'reload schema');
