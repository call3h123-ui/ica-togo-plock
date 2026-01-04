-- =========================================================
-- ICA ToGo Plock – Supabase SQL (tabeller + RPC + RLS + seed)
-- Kör i Supabase → SQL Editor
-- =========================================================

create extension if not exists "pgcrypto";

-- CATEGORIES
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_index int not null default 100,
  created_at timestamptz not null default now()
);

-- PRODUCTS
create table if not exists public.products (
  ean text primary key,
  name text not null,
  image_url text,
  default_category_id uuid references public.categories(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ORDER ITEMS
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  ean text not null references public.products(ean) on delete restrict,
  qty int not null default 0,
  category_id uuid not null references public.categories(id),
  is_picked boolean not null default false,
  picked_at timestamptz,
  picked_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint qty_nonnegative check (qty >= 0)
);

drop trigger if exists trg_order_items_updated_at on public.order_items;
create trigger trg_order_items_updated_at
before update on public.order_items
for each row execute function public.set_updated_at();

create unique index if not exists uq_order_items_ean on public.order_items(ean);

-- RPC: atomic increment
create or replace function public.increment_order_item(p_ean text, p_category_id uuid, p_delta int)
returns public.order_items
language plpgsql
security definer
as $$
declare
  v_row public.order_items;
begin
  insert into public.order_items (ean, qty, category_id, is_picked)
  values (p_ean, greatest(0, p_delta), p_category_id, false)
  on conflict (ean)
  do update set
    qty = greatest(0, public.order_items.qty + p_delta),
    category_id = excluded.category_id,
    is_picked = false,
    picked_at = null,
    picked_by = null
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_order_item_qty(p_ean text, p_category_id uuid, p_qty int)
returns public.order_items
language plpgsql
security definer
as $$
declare
  v_row public.order_items;
begin
  insert into public.order_items (ean, qty, category_id, is_picked)
  values (p_ean, greatest(0, p_qty), p_category_id, false)
  on conflict (ean)
  do update set
    qty = greatest(0, p_qty),
    category_id = excluded.category_id
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.set_picked(p_ean text, p_is_picked boolean, p_picked_by text)
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
  where ean = p_ean
  returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.clear_picked()
returns int
language plpgsql
security definer
as $$
declare v_count int;
begin
  delete from public.order_items where is_picked = true;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- RLS
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.order_items enable row level security;

create policy "read_categories" on public.categories
for select to authenticated using (true);

create policy "read_products" on public.products
for select to authenticated using (true);

create policy "read_order_items" on public.order_items
for select to authenticated using (true);

create policy "write_categories" on public.categories
for all to authenticated using (true) with check (true);

create policy "write_products" on public.products
for all to authenticated using (true) with check (true);

create policy "write_order_items" on public.order_items
for all to authenticated using (true) with check (true);

grant execute on function public.increment_order_item(text, uuid, int) to authenticated;
grant execute on function public.set_order_item_qty(text, uuid, int) to authenticated;
grant execute on function public.set_picked(text, boolean, text) to authenticated;
grant execute on function public.clear_picked() to authenticated;

-- SEED categories
insert into public.categories (name, sort_index)
values
 ('Kolonial/bröd/special', 10),
 ('Kött/chark/ost', 20),
 ('Mejeri', 30)
on conflict (name) do nothing;-- Tillåt både anon och authenticated att läsa/skriva (MVP utan login)

drop policy if exists "read_categories" on public.categories;
drop policy if exists "write_categories" on public.categories;
drop policy if exists "read_products" on public.products;
drop policy if exists "write_products" on public.products;
drop policy if exists "read_order_items" on public.order_items;
drop policy if exists "write_order_items" on public.order_items;

create policy "read_categories" on public.categories
for select to anon, authenticated using (true);

create policy "write_categories" on public.categories
for all to anon, authenticated using (true) with check (true);

create policy "read_products" on public.products
for select to anon, authenticated using (true);

create policy "write_products" on public.products
for all to anon, authenticated using (true) with check (true);

create policy "read_order_items" on public.order_items
for select to anon, authenticated using (true);

create policy "write_order_items" on public.order_items
for all to anon, authenticated using (true) with check (true);

grant execute on function public.increment_order_item(text, uuid, int) to anon;
grant execute on function public.set_order_item_qty(text, uuid, int) to anon;
grant execute on function public.set_picked(text, boolean, text) to anon;
grant execute on function public.clear_picked() to anon;
