-- Fix order_items so each store keeps its own rows (no overwrites across stores)
-- 1) Replace unique index on (ean) with composite (ean, store_id)
-- 2) Update RPC functions to use the composite conflict target

-- Drop old unique index (global per EAN) if it exists
DROP INDEX IF EXISTS uq_order_items_ean;

-- Create composite unique index per store
CREATE UNIQUE INDEX IF NOT EXISTS uq_order_items_ean_store
  ON public.order_items (ean, store_id);

-- Update increment_order_item to use (ean, store_id)
CREATE OR REPLACE FUNCTION public.increment_order_item(p_ean text, p_category_id uuid, p_delta int, p_store_id uuid)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.order_items;
BEGIN
  INSERT INTO public.order_items (ean, qty, category_id, is_picked, store_id)
  VALUES (p_ean, GREATEST(0, p_delta), p_category_id, false, p_store_id)
  ON CONFLICT (ean, store_id) DO UPDATE SET
    qty = GREATEST(0, public.order_items.qty + p_delta),
    category_id = excluded.category_id,
    is_picked = false,
    picked_at = NULL,
    picked_by = NULL
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Update set_order_item_qty to use (ean, store_id)
CREATE OR REPLACE FUNCTION public.set_order_item_qty(p_ean text, p_category_id uuid, p_qty int, p_store_id uuid)
RETURNS public.order_items
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.order_items;
BEGIN
  INSERT INTO public.order_items (ean, qty, category_id, is_picked, store_id)
  VALUES (p_ean, GREATEST(0, p_qty), p_category_id, false, p_store_id)
  ON CONFLICT (ean, store_id) DO UPDATE SET
    qty = GREATEST(0, p_qty),
    category_id = excluded.category_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
