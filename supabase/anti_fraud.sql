create table if not exists public.signup_risk_audit (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone_number text,
  username text,
  reason text not null,
  created_at timestamptz not null default now()
);

create or replace function public.block_suspicious_signup_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  email_local text;
  normalized_username text;
  phone_digits text;
  blocked_reason text := '';
begin
  normalized_email := lower(trim(coalesce(new.email, new.raw_user_meta_data->>'email', '')));
  email_local := split_part(normalized_email, '@', 1);
  normalized_username := lower(trim(coalesce(new.raw_user_meta_data->>'username', '')));
  phone_digits := regexp_replace(coalesce(new.phone, new.raw_user_meta_data->>'phone', ''), '\D', '', 'g');

  if email_local ~ '^(test|fake|bot|admin|support|temp|demo)[0-9._-]*$' then
    blocked_reason := 'Email local part matches reserved/fraud pattern.';
  elsif email_local ~ '^[0-9]{7,}$' then
    blocked_reason := 'Email local part is numeric-only and looks automated.';
  elsif normalized_username <> '' and normalized_username ~ '(.)\1{5,}' then
    blocked_reason := 'Username has repeated characters and looks automated.';
  elsif normalized_username <> '' and normalized_username ~ '^(test|fake|bot|admin|support|temp|demo)[0-9._-]*$' then
    blocked_reason := 'Username matches reserved/fraud pattern.';
  elsif phone_digits ~ '^(\d)\1{7,}$' then
    blocked_reason := 'Phone number uses repeated digits and looks invalid.';
  end if;

  if blocked_reason <> '' then
    insert into public.signup_risk_audit (email, phone_number, username, reason)
    values (
      nullif(normalized_email, ''),
      nullif(coalesce(new.phone, new.raw_user_meta_data->>'phone', ''), ''),
      nullif(normalized_username, ''),
      blocked_reason
    );

    raise exception 'Signup blocked by anti-fraud rules. Use real account details.';
  end if;

  return new;
end;
$$;

drop trigger if exists before_auth_user_insert_anti_fraud on auth.users;
create trigger before_auth_user_insert_anti_fraud
before insert on auth.users
for each row execute procedure public.block_suspicious_signup_profiles();

alter table public.signup_risk_audit enable row level security;
revoke all on public.signup_risk_audit from anon, authenticated;
