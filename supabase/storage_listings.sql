do $$
declare
  bucket_name text;
begin
  foreach bucket_name in array array['listing-images', 'post-images', 'posts', 'images']
  loop
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values (
      bucket_name,
      bucket_name,
      true,
      10485760,
      array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    )
    on conflict (id) do update
    set
      public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

    execute format('drop policy if exists %I on storage.objects;', bucket_name || '_public_read');
    execute format(
      'create policy %I on storage.objects for select using (bucket_id = %L);',
      bucket_name || '_public_read',
      bucket_name
    );

    execute format('drop policy if exists %I on storage.objects;', bucket_name || '_insert_own');
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);',
      bucket_name || '_insert_own',
      bucket_name
    );

    execute format('drop policy if exists %I on storage.objects;', bucket_name || '_update_own');
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);',
      bucket_name || '_update_own',
      bucket_name,
      bucket_name
    );

    execute format('drop policy if exists %I on storage.objects;', bucket_name || '_delete_own');
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text);',
      bucket_name || '_delete_own',
      bucket_name
    );
  end loop;
end $$;
