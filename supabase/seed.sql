insert into public.categories (slug, name)
values
  ('fashion', 'Fashion'),
  ('tech', 'Tech'),
  ('home', 'Home'),
  ('beauty', 'Beauty'),
  ('art', 'Art'),
  ('fitness', 'Fitness')
on conflict (slug) do update set name = excluded.name;
