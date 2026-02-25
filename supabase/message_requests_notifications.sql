create extension if not exists pgcrypto;

do $$
begin
  if exists (select 1 from pg_type where typname = 'notification_type')
     and not exists (
       select 1
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       where t.typname = 'notification_type'
         and e.enumlabel = 'post'
     ) then
    alter type public.notification_type add value 'post';
  end if;
exception
  when duplicate_object then null;
end $$;

alter table public.notifications
  add column if not exists actor_id uuid references public.users(id) on delete set null,
  add column if not exists title text,
  add column if not exists body text;

create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.users(id) on delete cascade,
  target_user_id uuid not null references public.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, target_user_id),
  check (requester_id <> target_user_id)
);

create index if not exists message_requests_requester_idx on public.message_requests(requester_id, created_at desc);
create index if not exists message_requests_target_idx on public.message_requests(target_user_id, created_at desc);
create index if not exists message_requests_conversation_idx on public.message_requests(conversation_id);
create index if not exists notifications_user_read_idx on public.notifications(user_id, is_read, created_at desc);

alter table public.message_requests enable row level security;

drop policy if exists message_requests_read_participants on public.message_requests;
create policy message_requests_read_participants on public.message_requests
for select using (auth.uid() in (requester_id, target_user_id));

drop policy if exists message_requests_insert_requester on public.message_requests;
create policy message_requests_insert_requester on public.message_requests
for insert with check (auth.uid() = requester_id and status = 'pending');

drop policy if exists message_requests_update_target on public.message_requests;
create policy message_requests_update_target on public.message_requests
for update
using (auth.uid() = target_user_id)
with check (auth.uid() = target_user_id and status in ('accepted', 'rejected'));

drop policy if exists message_requests_update_requester on public.message_requests;
create policy message_requests_update_requester on public.message_requests
for update
using (auth.uid() = requester_id)
with check (auth.uid() = requester_id and status = 'pending');

grant select, insert, update on public.message_requests to authenticated;

create or replace function public.touch_message_request_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists before_message_requests_update_touch on public.message_requests;
create trigger before_message_requests_update_touch
before update on public.message_requests
for each row execute procedure public.touch_message_request_updated_at();

create or replace function public.create_message_request(target_user_id_input uuid, request_text text default null)
returns table (
  conversation_id uuid,
  status text,
  target_user_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requester uuid := auth.uid();
  target_username text;
  requester_username text;
  pair_conversation_id uuid;
  existing_request public.message_requests%rowtype;
  default_request_text text;
begin
  if requester is null then
    raise exception 'Sign in required to create a message request.';
  end if;

  if target_user_id_input is null then
    raise exception 'Target user is required.';
  end if;

  if requester = target_user_id_input then
    raise exception 'You cannot create a message request for yourself.';
  end if;

  select u.username
  into target_username
  from public.users u
  where u.id = target_user_id_input;

  if target_username is null then
    raise exception 'Target user was not found.';
  end if;

  select c.id
  into pair_conversation_id
  from public.conversations c
  where (c.user_one = requester and c.user_two = target_user_id_input)
     or (c.user_one = target_user_id_input and c.user_two = requester)
  limit 1;

  if pair_conversation_id is null then
    insert into public.conversations (user_one, user_two)
    values (requester, target_user_id_input)
    returning id into pair_conversation_id;
  end if;

  select mr.*
  into existing_request
  from public.message_requests mr
  where mr.requester_id = requester
    and mr.target_user_id = target_user_id_input
  for update;

  if found then
    if existing_request.status = 'accepted' then
      conversation_id := coalesce(existing_request.conversation_id, pair_conversation_id);
      status := existing_request.status;
      target_user_id := existing_request.target_user_id;
      return next;
      return;
    end if;

    if existing_request.status = 'pending' then
      conversation_id := coalesce(existing_request.conversation_id, pair_conversation_id);
      status := existing_request.status;
      target_user_id := existing_request.target_user_id;
      return next;
      return;
    end if;

    update public.message_requests
    set
      status = 'pending',
      conversation_id = pair_conversation_id
    where id = existing_request.id
    returning message_requests.conversation_id, message_requests.status, message_requests.target_user_id
    into conversation_id, status, target_user_id;
  else
    insert into public.message_requests (requester_id, target_user_id, conversation_id, status)
    values (requester, target_user_id_input, pair_conversation_id, 'pending')
    returning message_requests.conversation_id, message_requests.status, message_requests.target_user_id
    into conversation_id, status, target_user_id;
  end if;

  select coalesce(nullif(u.username, ''), 'user')
  into requester_username
  from public.users u
  where u.id = requester;

  default_request_text := coalesce(
    nullif(trim(request_text), ''),
    format('@%s sent a message request. Accept to start chatting.', requester_username)
  );

  insert into public.messages (conversation_id, sender_id, content, is_seen)
  values (conversation_id, requester, default_request_text, false);

  insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
  values (
    target_user_id_input,
    'message',
    conversation_id,
    requester,
    'New message request',
    format('@%s sent you a message request.', requester_username)
  );

  return next;
end;
$$;

grant execute on function public.create_message_request(uuid, text) to authenticated;

create or replace function public.notify_on_message_request_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_username text;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.status = old.status then
    return new;
  end if;

  select coalesce(nullif(u.username, ''), 'user')
  into actor_username
  from public.users u
  where u.id = new.target_user_id;

  if new.status = 'accepted' then
    insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
    values (
      new.requester_id,
      'message',
      new.conversation_id,
      new.target_user_id,
      'Message request accepted',
      format('@%s accepted your message request.', actor_username)
    );

    insert into public.messages (conversation_id, sender_id, content, is_seen)
    values (
      new.conversation_id,
      new.target_user_id,
      format('@%s accepted the message request. You can now chat freely.', actor_username),
      false
    );
  elsif new.status = 'rejected' then
    insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
    values (
      new.requester_id,
      'message',
      new.conversation_id,
      new.target_user_id,
      'Message request declined',
      format('@%s declined your message request.', actor_username)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists after_message_requests_status_notify on public.message_requests;
create trigger after_message_requests_status_notify
after update on public.message_requests
for each row execute procedure public.notify_on_message_request_status();

create or replace function public.notify_on_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
  sender_username text;
begin
  select
    case
      when c.user_one = new.sender_id then c.user_two
      else c.user_one
    end
  into recipient_id
  from public.conversations c
  where c.id = new.conversation_id;

  if recipient_id is null or recipient_id = new.sender_id then
    return new;
  end if;

  if exists (
    select 1
    from public.message_requests mr
    where mr.conversation_id = new.conversation_id
      and mr.requester_id = new.sender_id
      and mr.target_user_id = recipient_id
      and mr.status = 'pending'
  ) then
    return new;
  end if;

  select coalesce(nullif(u.username, ''), 'user')
  into sender_username
  from public.users u
  where u.id = new.sender_id;

  insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
  values (
    recipient_id,
    'message',
    new.conversation_id,
    new.sender_id,
    'New message',
    format('@%s sent you a new message.', sender_username)
  );

  return new;
end;
$$;

drop trigger if exists after_messages_insert_notify on public.messages;
create trigger after_messages_insert_notify
after insert on public.messages
for each row execute procedure public.notify_on_new_message();

create or replace function public.notify_on_new_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  follower_username text;
begin
  if new.follower_id = new.following_id then
    return new;
  end if;

  select coalesce(nullif(u.username, ''), 'user')
  into follower_username
  from public.users u
  where u.id = new.follower_id;

  insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
  values (
    new.following_id,
    'follow',
    new.id,
    new.follower_id,
    'New follower',
    format('@%s started following you.', follower_username)
  );

  return new;
end;
$$;

drop trigger if exists after_followers_insert_notify on public.followers;
create trigger after_followers_insert_notify
after insert on public.followers
for each row execute procedure public.notify_on_new_follow();

create or replace function public.notify_followers_on_new_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_username text;
  post_title text;
begin
  select coalesce(nullif(u.username, ''), 'user')
  into author_username
  from public.users u
  where u.id = new.user_id;

  post_title := left(trim(coalesce(new.title, 'New listing')), 80);

  insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
  select
    f.follower_id,
    'post',
    new.id,
    new.user_id,
    format('New post from @%s', author_username),
    format('@%s posted: %s', author_username, post_title)
  from public.followers f
  where f.following_id = new.user_id
    and f.follower_id <> new.user_id;

  return new;
end;
$$;

drop trigger if exists after_posts_insert_notify_followers on public.posts;
create trigger after_posts_insert_notify_followers
after insert on public.posts
for each row execute procedure public.notify_followers_on_new_post();

create or replace function public.notify_on_new_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner_id uuid;
  liker_username text;
begin
  select p.user_id
  into post_owner_id
  from public.posts p
  where p.id = new.post_id;

  if post_owner_id is null or post_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(u.username, ''), 'user')
  into liker_username
  from public.users u
  where u.id = new.user_id;

  insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
  values (
    post_owner_id,
    'like',
    new.post_id,
    new.user_id,
    'New like',
    format('@%s liked your listing.', liker_username)
  );

  return new;
end;
$$;

drop trigger if exists after_likes_insert_notify on public.likes;
create trigger after_likes_insert_notify
after insert on public.likes
for each row execute procedure public.notify_on_new_like();

create or replace function public.notify_on_new_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_owner_id uuid;
  commenter_username text;
  comment_preview text;
begin
  select p.user_id
  into post_owner_id
  from public.posts p
  where p.id = new.post_id;

  if post_owner_id is null or post_owner_id = new.user_id then
    return new;
  end if;

  select coalesce(nullif(u.username, ''), 'user')
  into commenter_username
  from public.users u
  where u.id = new.user_id;

  comment_preview := left(trim(coalesce(new.content, '')), 60);

  insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
  values (
    post_owner_id,
    'comment',
    new.post_id,
    new.user_id,
    'New comment',
    case
      when comment_preview = '' then format('@%s commented on your listing.', commenter_username)
      else format('@%s commented: "%s"', commenter_username, comment_preview)
    end
  );

  return new;
end;
$$;

drop trigger if exists after_comments_insert_notify on public.comments;
create trigger after_comments_insert_notify
after insert on public.comments
for each row execute procedure public.notify_on_new_comment();

create or replace function public.notify_on_kyc_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, type, reference_id, title, body)
    values (
      new.user_id,
      'mention',
      new.id,
      'Verification request submitted',
      format('Your %s verification request is pending review.', new.tier_requested)
    );
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status <> old.status and new.status in ('approved', 'rejected') then
    insert into public.notifications (user_id, type, reference_id, actor_id, title, body)
    values (
      new.user_id,
      'mention',
      new.id,
      new.reviewed_by,
      case when new.status = 'approved' then 'Verification approved' else 'Verification rejected' end,
      case
        when new.status = 'approved'
          then format('Your %s verification request has been approved.', new.tier_requested)
        else format('Your %s verification request was rejected. Update details and try again.', new.tier_requested)
      end
    );
  end if;

  return new;
end;
$$;

drop trigger if exists after_kyc_insert_notify on public.kyc_verifications;
create trigger after_kyc_insert_notify
after insert on public.kyc_verifications
for each row execute procedure public.notify_on_kyc_change();

drop trigger if exists after_kyc_update_notify on public.kyc_verifications;
create trigger after_kyc_update_notify
after update on public.kyc_verifications
for each row execute procedure public.notify_on_kyc_change();

select pg_notify('pgrst', 'reload schema');
