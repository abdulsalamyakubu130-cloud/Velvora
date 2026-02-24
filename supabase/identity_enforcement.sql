create extension if not exists citext;

create or replace function public.enforce_signup_identity_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_email text;
  metadata_phone text;
  normalized_phone text;
begin
  metadata_phone := trim(coalesce(new.raw_user_meta_data->>'phone', ''));
  normalized_phone := nullif(coalesce(new.phone, metadata_phone), '');

  if normalized_phone is null then
    raise exception 'Phone number is required for signup.';
  end if;

  metadata_email := lower(trim(coalesce(new.raw_user_meta_data->>'email', new.email, '')));

  if metadata_email = '' then
    raise exception 'Email is required for signup.';
  end if;

  if metadata_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Email format is invalid.';
  end if;

  if exists (
    select 1
    from public.users u
    where u.email = metadata_email::citext
      and u.id <> new.id
  ) then
    raise exception 'This email is already linked to another account.';
  end if;

  if exists (
    select 1
    from public.users u
    where u.phone_number = normalized_phone
      and u.id <> new.id
  ) then
    raise exception 'This phone number is already linked to another account.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_auth_user_insert_identity_rules on auth.users;
create trigger before_auth_user_insert_identity_rules
before insert on auth.users
for each row execute procedure public.enforce_signup_identity_rules();
