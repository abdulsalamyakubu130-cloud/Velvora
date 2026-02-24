update public.users
set country = 'Nigeria'
where coalesce(trim(country), '') = '';

update auth.users
set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('country', 'Nigeria')
where coalesce(trim(raw_user_meta_data->>'country'), '') = '';
