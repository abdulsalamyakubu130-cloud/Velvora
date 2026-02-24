create extension if not exists citext;

create table if not exists public.banned_email_domains (
  domain citext primary key,
  reason text not null default 'Disposable/temporary email domain',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.email_policy_audit (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  domain citext not null,
  event_type text not null,
  detail text,
  created_at timestamptz not null default now()
);

insert into public.banned_email_domains (domain, reason)
values
  ('10minutemail.com', 'Disposable email domain'),
  ('10minutemail.net', 'Disposable email domain'),
  ('20minutemail.com', 'Disposable email domain'),
  ('dispostable.com', 'Disposable email domain'),
  ('fakeinbox.com', 'Disposable email domain'),
  ('getairmail.com', 'Disposable email domain'),
  ('guerrillamail.com', 'Disposable email domain'),
  ('maildrop.cc', 'Disposable email domain'),
  ('mailinator.com', 'Disposable email domain'),
  ('mintemail.com', 'Disposable email domain'),
  ('sharklasers.com', 'Disposable email domain'),
  ('tempmail.com', 'Disposable email domain'),
  ('tempmail.dev', 'Disposable email domain'),
  ('temp-mail.org', 'Disposable email domain'),
  ('trashmail.com', 'Disposable email domain'),
  ('yopmail.com', 'Disposable email domain')
on conflict (domain) do nothing;

create or replace function public.extract_email_domain(email_value text)
returns text
language sql
immutable
as $$
  select lower(split_part(trim(email_value), '@', 2));
$$;

create or replace function public.block_banned_email_domains()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  normalized_domain text;
begin
  normalized_email := lower(trim(coalesce(new.email, new.raw_user_meta_data->>'email', '')));
  if normalized_email = '' then
    return new;
  end if;

  normalized_domain := public.extract_email_domain(normalized_email);

  if exists (
    select 1
    from public.banned_email_domains d
    where d.domain = normalized_domain
      and d.is_active = true
  ) then
    insert into public.email_policy_audit (email, domain, event_type, detail)
    values (
      normalized_email,
      normalized_domain,
      'signup_blocked',
      'Signup blocked due to banned/disposable email domain.'
    );

    raise exception 'This email domain is not allowed on Velvora.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_auth_user_insert_email_policy on auth.users;
create trigger before_auth_user_insert_email_policy
before insert on auth.users
for each row execute procedure public.block_banned_email_domains();

create or replace function public.ban_existing_users_on_banned_domains()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  update auth.users u
  set banned_until = 'infinity'::timestamptz
  where public.extract_email_domain(u.email) in (
    select domain::text
    from public.banned_email_domains
    where is_active = true
  )
  and (u.banned_until is null or u.banned_until < now());

  get diagnostics affected = row_count;
  return affected;
end;
$$;

alter table public.banned_email_domains enable row level security;
alter table public.email_policy_audit enable row level security;

revoke all on public.banned_email_domains from anon, authenticated;
revoke all on public.email_policy_audit from anon, authenticated;
