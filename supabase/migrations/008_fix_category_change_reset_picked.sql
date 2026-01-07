-- Fix: Reset is_picked when changing category or qty
-- This ensures items remain visible in the order list after category changes

-- Update set_order_item_qty to reset is_picked
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
  on conflict (ean) do update set
    qty = greatest(0, p_qty),
    category_id = excluded.category_id,
    store_id = p_store_id,
    is_picked = false,
    picked_at = null,
    picked_by = null
  returning * into v_row;

  return v_row;
end;
$$;

-- Update increment_order_item to ensure it also resets is_picked (should already do this, but making sure)
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
  on conflict (ean) do update set
    qty = greatest(0, public.order_items.qty + p_delta),
    category_id = excluded.category_id,
    store_id = p_store_id,
    is_picked = false,
    picked_at = null,
    picked_by = null
  returning * into v_row;

  return v_row;
end;
$$;
