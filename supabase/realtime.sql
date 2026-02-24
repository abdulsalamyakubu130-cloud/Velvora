alter table public.messages replica identity full;
alter table public.notifications replica identity full;
alter table public.posts replica identity full;
alter table public.post_images replica identity full;
alter table public.likes replica identity full;
alter table public.comments replica identity full;
alter table public.followers replica identity full;
alter table public.users replica identity full;

do $$
begin
  if to_regclass('public.message_requests') is not null then
    execute 'alter table public.message_requests replica identity full';
  end if;
end $$;

do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.message_requests;
  exception
    when duplicate_object then null;
    when undefined_table then null;
  end;

  begin
    alter publication supabase_realtime add table public.notifications;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.posts;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.post_images;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.likes;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.comments;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.followers;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.users;
  exception
    when duplicate_object then null;
  end;
end $$;
