-- Seed stores and admin data for multi-store implementation
-- Insert example stores with bcrypt hashed passwords
INSERT INTO public.stores (name, password_hash)
VALUES 
  ('Agunnaryd', crypt('AG123', gen_salt('bf'))),
  ('Horda', crypt('HA123', gen_salt('bf')))
ON CONFLICT (name) DO NOTHING;

-- Insert admin password (you can change this)
INSERT INTO public.store_admins (password_hash)
VALUES (crypt('admin123', gen_salt('bf')))
ON CONFLICT DO NOTHING;

-- Migrate existing order_items to Agunnaryd store (assumes order_items without store_id are from Agunnaryd)
UPDATE public.order_items 
SET store_id = (SELECT id FROM public.stores WHERE name = 'Agunnaryd')
WHERE store_id IS NULL;

-- Migrate existing categories to Agunnaryd store
UPDATE public.categories
SET store_id = (SELECT id FROM public.stores WHERE name = 'Agunnaryd')
WHERE store_id IS NULL;
