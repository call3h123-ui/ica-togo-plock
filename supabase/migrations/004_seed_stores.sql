-- Seed script for multi-store implementation
-- Run this in Supabase SQL Editor after the migration

-- Insert example stores with bcrypt hashed passwords
insert into public.stores (name, password_hash)
values 
  ('Agunnaryd', crypt('AG123', gen_salt('bf'))),
  ('Horda', crypt('HA123', gen_salt('bf')))
on conflict (name) do nothing;

-- Insert admin password (you can change this)
insert into public.store_admins (password_hash)
values (crypt('admin123', gen_salt('bf')))
on conflict do nothing;

-- Migrate existing order_items to Agunnaryd store (you can change this based on your needs)
-- This assumes order_items without a store_id are from ToGo (Agunnaryd)
update public.order_items 
set store_id = (select id from public.stores where name = 'Agunnaryd')
where store_id is null;

-- Migrate existing categories to Agunnaryd store
update public.categories
set store_id = (select id from public.stores where name = 'Agunnaryd')
where store_id is null;
