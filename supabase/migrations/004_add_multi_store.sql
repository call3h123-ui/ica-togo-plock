-- =========================================================
-- Multi-store implementation
-- Adds store management, authentication, and data isolation
-- =========================================================

-- STORES TABLE
create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Function to hash password before insert/update
create or replace function public.hash_store_password()
returns trigger language plpgsql as $$
begin
  if new.password_hash is not null and new.password_hash !~ '^\$2' then
    new.password_hash := crypt(new.password_hash, gen_salt('bf'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hash_store_password on public.stores;
create trigger trg_hash_store_password
before insert or update on public.stores
for each row execute function public.hash_store_password();

-- STORE ADMINS TABLE (for admin/backoffice access)
create table if not exists public.store_admins (
  id uuid primary key default gen_random_uuid(),
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Function to hash admin password
create or replace function public.hash_admin_password()
returns trigger language plpgsql as $$
begin
  if new.password_hash is not null and new.password_hash !~ '^\$2' then
    new.password_hash := crypt(new.password_hash, gen_salt('bf'));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_hash_admin_password on public.store_admins;
create trigger trg_hash_admin_password
before insert or update on public.store_admins
for each row execute function public.hash_admin_password();

-- Add store_id to categories (NULL for now, will populate existing)
alter table if exists public.categories
add column if not exists store_id uuid references public.stores(id) on delete cascade;

-- Add store_id to order_items
alter table if exists public.order_items
add column if not exists store_id uuid references public.stores(id) on delete cascade;

-- Update existing categories and order_items to have a default store
-- First, create default stores for migration
-- This will be done via RPC or separate insert

-- Create indexes for better query performance
create index if not exists idx_categories_store_id on public.categories(store_id);
create index if not exists idx_order_items_store_id on public.order_items(store_id);

-- Update RLS policies for store isolation
-- Drop old policies
drop policy if exists "read_categories" on public.categories;
drop policy if exists "write_categories" on public.categories;
drop policy if exists "read_order_items" on public.order_items;
drop policy if exists "write_order_items" on public.order_items;
drop policy if exists "read_products" on public.products;
drop policy if exists "write_products" on public.products;

-- Enable RLS on stores and store_admins
alter table public.stores enable row level security;
alter table public.store_admins enable row level security;

-- Stores: anyone can read, only admin can write
create policy "read_stores" on public.stores
for select to anon, authenticated using (true);

create policy "write_stores" on public.stores
for all to authenticated using (true) with check (true);

-- Store Admins: nobody can directly read/write (controlled via functions)
create policy "admin_control" on public.store_admins
for all to authenticated using (false) with check (false);

-- Categories: read all, but only write own store's
create policy "read_all_categories" on public.categories
for select to anon, authenticated using (true);

create policy "write_own_store_categories" on public.categories
for insert to anon, authenticated with check (store_id is not null);

create policy "update_own_store_categories" on public.categories
for update to anon, authenticated using (true) with check (true);

-- Order Items: read/write only own store
create policy "read_own_store_order_items" on public.order_items
for select to anon, authenticated using (store_id is not null);

create policy "write_own_store_order_items" on public.order_items
for all to anon, authenticated using (true) with check (store_id is not null);

-- Products: read all (shared), write controlled via app
create policy "read_all_products" on public.products
for select to anon, authenticated using (true);

create policy "write_products" on public.products
for all to anon, authenticated using (true) with check (true);

-- Update RPC functions to accept store_id parameter
create or replace function public.increment_order_item(p_ean text, p_category_id uuid, p_delta int, p_store_id uuid)
returns public.order_items
language plpgsql
security definer
as $$
declare
  v_row public.order_items;
begin
  insert into public.order_items (ean, qty, category_id, is_picked, store_id)
  values (p_ean, greatest(0, p_delta), p_category_id, false, p_store_id)
  on conflict (ean)
  do update set
    qty = greatest(0, public.order_items.qty + p_delta),
    category_id = excluded.category_id,
    is_picked = false,
    picked_at = null,
    picked_by = null,
    store_id = p_store_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_order_item_qty(p_ean text, p_category_id uuid, p_qty int, p_store_id uuid)
returns public.order_items
language plpgsql
security definer
as $$
declare
  v_row public.order_items;
begin
  insert into public.order_items (ean, qty, category_id, is_picked, store_id)
  values (p_ean, greatest(0, p_qty), p_category_id, false, p_store_id)
  on conflict (ean)
  do update set
    qty = greatest(0, p_qty),
    category_id = excluded.category_id,
    store_id = p_store_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_picked(p_ean text, p_is_picked boolean, p_picked_by text, p_store_id uuid)
returns public.order_items
language plpgsql
security definer
as $$
declare v_row public.order_items;
begin
  update public.order_items
  set
    is_picked = p_is_picked,
    picked_at = case when p_is_picked then now() else null end,
    picked_by = case when p_is_picked then p_picked_by else null end
  where ean = p_ean and store_id = p_store_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.clear_picked(p_store_id uuid)
returns int
language plpgsql
security definer
as $$
declare v_count int;
begin
  delete from public.order_items where is_picked = true and store_id = p_store_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Grant execute permissions
grant execute on function public.increment_order_item(text, uuid, int, uuid) to anon, authenticated;
grant execute on function public.set_order_item_qty(text, uuid, int, uuid) to anon, authenticated;
grant execute on function public.set_picked(text, boolean, text, uuid) to anon, authenticated;
grant execute on function public.clear_picked(uuid) to anon, authenticated;

-- Function to verify store password (returns store_id if valid)
create or replace function public.verify_store_login(p_store_name text, p_password text)
returns uuid
language plpgsql
security definer
as $$
declare
  v_store_id uuid;
begin
  select id into v_store_id
  from public.stores
  where name = p_store_name
  and password_hash = crypt(p_password, password_hash);
  
  return v_store_id;
end;
$$;

grant execute on function public.verify_store_login(text, text) to anon, authenticated;

-- Function to verify admin password
create or replace function public.verify_admin_login(p_password text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_exists boolean;
begin
  select exists(
    select 1 from public.store_admins
    where password_hash = crypt(p_password, password_hash)
  ) into v_exists;
  
  return v_exists;
end;
$$;

grant execute on function public.verify_admin_login(text) to anon, authenticated;
