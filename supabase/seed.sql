insert into public.categories (slug, name)
values
  ('fashion', 'Fashion'),
  ('tech', 'Tech'),
  ('cars-vehicles', 'Cars & Vehicles'),
  ('phones-tablets', 'Phones & Tablets'),
  ('computers', 'Computers'),
  ('home', 'Home'),
  ('property', 'Property'),
  ('beauty', 'Beauty'),
  ('art', 'Art'),
  ('fitness', 'Fitness'),
  ('services', 'Services'),
  ('jobs', 'Jobs'),
  ('others', 'Others')
on conflict (slug) do update set name = excluded.name;
