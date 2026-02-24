-- Sync users.is_verified + users.verification_tier from approved KYC rows.
-- Run this in Supabase SQL Editor once. It is idempotent.

create or replace function public.refresh_user_verification_from_kyc(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  highest_approved_tier public.verification_tier := 'none';
begin
  select
    coalesce(
      case
        when bool_or(k.tier_requested = 'enhanced'::public.verification_tier) then 'enhanced'::public.verification_tier
        when bool_or(k.tier_requested = 'basic'::public.verification_tier) then 'basic'::public.verification_tier
        else 'none'::public.verification_tier
      end,
      'none'::public.verification_tier
    )
  into highest_approved_tier
  from public.kyc_verifications k
  where k.user_id = target_user_id
    and k.status = 'approved';

  if highest_approved_tier = 'none'::public.verification_tier then
    return;
  end if;

  update public.users u
  set
    is_verified = true,
    verification_tier = (
      case
        when coalesce(u.verification_tier, 'none'::public.verification_tier) = 'enhanced'::public.verification_tier
          or highest_approved_tier = 'enhanced'::public.verification_tier
          then 'enhanced'::public.verification_tier
        when coalesce(u.verification_tier, 'none'::public.verification_tier) = 'basic'::public.verification_tier
          or highest_approved_tier = 'basic'::public.verification_tier
          then 'basic'::public.verification_tier
        else 'none'::public.verification_tier
      end
    )
  where u.id = target_user_id;
end;
$$;

create or replace function public.sync_user_verification_from_kyc_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'approved' then
      perform public.refresh_user_verification_from_kyc(new.user_id);
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.status = 'approved'
       or old.status = 'approved'
       or new.tier_requested is distinct from old.tier_requested then
      perform public.refresh_user_verification_from_kyc(new.user_id);
    end if;
    return new;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists after_kyc_verifications_sync_user on public.kyc_verifications;
create trigger after_kyc_verifications_sync_user
after insert or update of status, tier_requested
on public.kyc_verifications
for each row
execute procedure public.sync_user_verification_from_kyc_trigger();

do $$
declare
  target_row record;
begin
  for target_row in
    select distinct k.user_id
    from public.kyc_verifications k
    where k.status = 'approved'
  loop
    perform public.refresh_user_verification_from_kyc(target_row.user_id);
  end loop;
end
$$;

