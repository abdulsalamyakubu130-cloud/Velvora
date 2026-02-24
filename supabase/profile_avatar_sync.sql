create extension if not exists citext;
alter table public.users add column if not exists profile_picture_url text;

create or replace function public.sync_public_user_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users u
  set
    email = coalesce(nullif(coalesce(new.email, new.raw_user_meta_data->>'email'), ''), u.email),
    phone_number = coalesce(nullif(coalesce(new.phone, new.raw_user_meta_data->>'phone'), ''), u.phone_number),
    profile_picture_url = coalesce(
      nullif(
        coalesce(
          new.raw_user_meta_data->>'profile_picture_url',
          new.raw_user_meta_data->>'avatar_url',
          new.raw_user_meta_data->>'picture'
        ),
        ''
      ),
      u.profile_picture_url,
      u.avatar_url
    ),
    avatar_url = coalesce(
      nullif(
        coalesce(
          new.raw_user_meta_data->>'avatar_url',
          new.raw_user_meta_data->>'profile_picture_url',
          new.raw_user_meta_data->>'picture'
        ),
        ''
      ),
      u.avatar_url,
      u.profile_picture_url
    ),
    country = case
      when coalesce(u.country, '') = '' then coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Nigeria')
      else u.country
    end,
    full_name = case
      when coalesce(u.full_name, '') = '' then coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), '')
      else u.full_name
    end
  where u.id = new.id;

  if found then
    return new;
  end if;

  insert into public.users (id, username, full_name, email, phone_number, country, avatar_url, profile_picture_url)
  values (
    new.id,
    ('user_' || substring(new.id::text, 1, 8))::citext,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), ''),
    nullif(coalesce(new.email, new.raw_user_meta_data->>'email'), ''),
    nullif(coalesce(new.phone, new.raw_user_meta_data->>'phone'), ''),
    coalesce(nullif(new.raw_user_meta_data->>'country', ''), 'Nigeria'),
    nullif(
      coalesce(
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'profile_picture_url',
        new.raw_user_meta_data->>'picture'
      ),
      ''
    ),
    nullif(
      coalesce(
        new.raw_user_meta_data->>'profile_picture_url',
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'picture'
      ),
      ''
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

update public.users u
set
  email = coalesce(u.email, nullif(coalesce(au.email, au.raw_user_meta_data->>'email'), '')),
  phone_number = coalesce(u.phone_number, nullif(coalesce(au.phone, au.raw_user_meta_data->>'phone'), '')),
  profile_picture_url = coalesce(
    u.profile_picture_url,
    u.avatar_url,
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
    u.avatar_url,
    u.profile_picture_url,
    nullif(
      coalesce(
        au.raw_user_meta_data->>'avatar_url',
        au.raw_user_meta_data->>'profile_picture_url',
        au.raw_user_meta_data->>'picture'
      ),
      ''
    )
  ),
  country = case
    when coalesce(u.country, '') = '' then coalesce(nullif(au.raw_user_meta_data->>'country', ''), 'Nigeria')
    else u.country
  end,
  full_name = case
    when coalesce(u.full_name, '') = '' then coalesce(nullif(au.raw_user_meta_data->>'full_name', ''), '')
    else u.full_name
  end
from auth.users au
where au.id = u.id;

insert into public.users (id, username, full_name, email, phone_number, country, avatar_url, profile_picture_url)
select
  au.id,
  ('user_' || substring(au.id::text, 1, 8))::citext,
  coalesce(nullif(au.raw_user_meta_data->>'full_name', ''), ''),
  nullif(coalesce(au.email, au.raw_user_meta_data->>'email'), ''),
  nullif(coalesce(au.phone, au.raw_user_meta_data->>'phone'), ''),
  coalesce(nullif(au.raw_user_meta_data->>'country', ''), 'Nigeria'),
  nullif(
    coalesce(
      au.raw_user_meta_data->>'avatar_url',
      au.raw_user_meta_data->>'profile_picture_url',
      au.raw_user_meta_data->>'picture'
    ),
    ''
  ),
  nullif(
    coalesce(
      au.raw_user_meta_data->>'profile_picture_url',
      au.raw_user_meta_data->>'avatar_url',
      au.raw_user_meta_data->>'picture'
    ),
    ''
  )
from auth.users au
left join public.users u on u.id = au.id
where u.id is null
on conflict (id) do nothing;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
after insert or update of email, phone, raw_user_meta_data on auth.users
for each row execute procedure public.sync_public_user_profile_from_auth();

select pg_notify('pgrst', 'reload schema');
