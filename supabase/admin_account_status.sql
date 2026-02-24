create table if not exists public.user_account_status (
  user_id uuid primary key references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'restricted', 'banned')),
  reason text not null default '',
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists user_account_status_status_idx
  on public.user_account_status(status);

alter table public.user_account_status enable row level security;

drop policy if exists user_account_status_read_own on public.user_account_status;
create policy user_account_status_read_own on public.user_account_status
for select
using (auth.uid() = user_id);

drop policy if exists user_account_status_read_admin on public.user_account_status;
create policy user_account_status_read_admin on public.user_account_status
for select
using ((auth.jwt() ->> 'role') = 'admin');

drop policy if exists user_account_status_write_admin on public.user_account_status;
create policy user_account_status_write_admin on public.user_account_status
for all
using ((auth.jwt() ->> 'role') = 'admin')
with check ((auth.jwt() ->> 'role') = 'admin');

notify pgrst, 'reload schema';
