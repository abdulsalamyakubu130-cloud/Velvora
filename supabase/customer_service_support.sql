create extension if not exists citext;

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category text not null default 'general' check (category in ('general', 'account', 'payments', 'orders', 'technical', 'safety')),
  subject text not null check (char_length(trim(subject)) between 5 and 120),
  message text not null check (char_length(trim(message)) between 20 and 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_user_id_idx on public.support_requests(user_id);
create index if not exists support_requests_status_idx on public.support_requests(status, created_at desc);

create table if not exists public.support_admin_allowlist (
  email citext primary key,
  created_at timestamptz not null default now()
);

create or replace function public.touch_support_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_support_request_update_touch on public.support_requests;
create trigger before_support_request_update_touch
before update on public.support_requests
for each row execute procedure public.touch_support_request_updated_at();

alter table public.support_requests enable row level security;
alter table public.support_admin_allowlist enable row level security;

create or replace function public.is_support_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  profile_email text := '';
  effective_email text := '';
begin
  select lower(trim(coalesce(u.email::text, '')))
  into profile_email
  from public.users u
  where u.id = auth.uid();

  effective_email := coalesce(nullif(claim_email, ''), nullif(profile_email, ''), '');

  return (
    (auth.jwt() ->> 'role') = 'admin'
    or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    or (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
    or effective_email = 'velvora278@gmail.com'
    or (
      effective_email <> ''
      and exists (
        select 1
        from public.support_admin_allowlist allowlist
        where lower(trim(allowlist.email::text)) = effective_email
      )
    )
  );
end;
$$;

grant execute on function public.is_support_admin() to anon, authenticated;

drop policy if exists support_admin_allowlist_read_admin on public.support_admin_allowlist;
create policy support_admin_allowlist_read_admin on public.support_admin_allowlist
for select using (public.is_support_admin());

drop policy if exists support_admin_allowlist_write_admin on public.support_admin_allowlist;
create policy support_admin_allowlist_write_admin on public.support_admin_allowlist
for all
using (public.is_support_admin())
with check (public.is_support_admin());

drop policy if exists support_requests_select_own_or_admin on public.support_requests;
create policy support_requests_select_own_or_admin on public.support_requests
for select using (
  auth.uid() = user_id
  or public.is_support_admin()
);

drop policy if exists support_requests_insert_own on public.support_requests;
create policy support_requests_insert_own on public.support_requests
for insert with check (auth.uid() = user_id and status = 'open');

drop policy if exists support_requests_update_admin on public.support_requests;
create policy support_requests_update_admin on public.support_requests
for update
using (public.is_support_admin())
with check (public.is_support_admin());

notify pgrst, 'reload schema';
