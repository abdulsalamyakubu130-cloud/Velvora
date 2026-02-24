-- Backfill users.profile_picture_url / avatar_url from all available sources.
-- Safe to run multiple times.

alter table public.users add column if not exists profile_picture_url text;
alter table public.users add column if not exists avatar_url text;

-- 1) Reuse existing values across the two columns.
update public.users
set profile_picture_url = avatar_url
where coalesce(profile_picture_url, '') = ''
  and coalesce(avatar_url, '') <> '';

update public.users
set avatar_url = profile_picture_url
where coalesce(avatar_url, '') = ''
  and coalesce(profile_picture_url, '') <> '';

-- 2) Backfill from auth metadata when available.
update public.users u
set
  profile_picture_url = coalesce(
    nullif(u.profile_picture_url, ''),
    nullif(
      coalesce(
        au.raw_user_meta_data->>'profile_picture_url',
        au.raw_user_meta_data->>'avatar_url',
        au.raw_user_meta_data->>'picture'
      ),
      ''
    )
  ),
  avatar_url = coalesce(
    nullif(u.avatar_url, ''),
    nullif(
      coalesce(
        au.raw_user_meta_data->>'avatar_url',
        au.raw_user_meta_data->>'profile_picture_url',
        au.raw_user_meta_data->>'picture'
      ),
      ''
    )
  )
from auth.users au
where au.id = u.id
  and (
    coalesce(u.profile_picture_url, '') = ''
    or coalesce(u.avatar_url, '') = ''
  );

-- 3) Backfill from storage using object owner.
with ranked_by_owner as (
  select
    o.bucket_id,
    o.name,
    o.owner::text as owner_user_id,
    row_number() over (
      partition by o.owner
      order by o.created_at desc nulls last, o.updated_at desc nulls last, o.name desc
    ) as row_rank
  from storage.objects o
  where o.bucket_id in ('avatars', 'avatar', 'profile', 'profile-avatars', 'profile-pictures', 'profile_pictures')
    and o.owner is not null
)
update public.users u
set
  profile_picture_url = coalesce(nullif(u.profile_picture_url, ''), r.bucket_id || '/' || r.name),
  avatar_url = coalesce(nullif(u.avatar_url, ''), r.bucket_id || '/' || r.name)
from ranked_by_owner r
where r.row_rank = 1
  and r.owner_user_id = u.id::text
  and (
    coalesce(u.profile_picture_url, '') = ''
    or coalesce(u.avatar_url, '') = ''
  );

-- 4) Backfill from storage path folder convention: {user_id}/{file}.
with ranked_by_folder as (
  select
    o.bucket_id,
    o.name,
    split_part(o.name, '/', 1) as folder_user_id,
    row_number() over (
      partition by split_part(o.name, '/', 1)
      order by o.created_at desc nulls last, o.updated_at desc nulls last, o.name desc
    ) as row_rank
  from storage.objects o
  where o.bucket_id in ('avatars', 'avatar', 'profile', 'profile-avatars', 'profile-pictures', 'profile_pictures')
    and position('/' in o.name) > 0
)
update public.users u
set
  profile_picture_url = coalesce(nullif(u.profile_picture_url, ''), r.bucket_id || '/' || r.name),
  avatar_url = coalesce(nullif(u.avatar_url, ''), r.bucket_id || '/' || r.name)
from ranked_by_folder r
where r.row_rank = 1
  and r.folder_user_id = u.id::text
  and (
    coalesce(u.profile_picture_url, '') = ''
    or coalesce(u.avatar_url, '') = ''
  );

select pg_notify('pgrst', 'reload schema');
