-- =========================================================
-- Global categories with per-store preferences
-- Categories are now global (shared), stores customize sort order
-- =========================================================

-- Step 1: Create new table for per-store category sort preferences
CREATE TABLE IF NOT EXISTS public.store_category_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  sort_index INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_store_category UNIQUE(store_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_store_category_prefs_store_id 
  ON public.store_category_preferences(store_id);
CREATE INDEX IF NOT EXISTS idx_store_category_prefs_category_id 
  ON public.store_category_preferences(category_id);

-- Step 2: Remove store_id from categories (make them global)
ALTER TABLE public.categories DROP COLUMN IF EXISTS store_id;

-- Step 3: Update RLS on categories - everyone can read all global categories
DROP POLICY IF EXISTS "read_all_categories" ON public.categories;
DROP POLICY IF EXISTS "write_own_store_categories" ON public.categories;
DROP POLICY IF EXISTS "update_own_store_categories" ON public.categories;

CREATE POLICY "read_categories" ON public.categories
  FOR SELECT TO anon, authenticated USING (true);

-- Only allow admin to create/update/delete categories (enforce via app)
CREATE POLICY "write_categories" ON public.categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 4: Enable RLS on store_category_preferences
ALTER TABLE public.store_category_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_own_store_prefs" ON public.store_category_preferences
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "write_own_store_prefs" ON public.store_category_preferences
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Step 5: Update order_items RPC to remove store_id constraint on conflict
-- This makes EAN->category mapping global (all stores share)
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
  ON CONFLICT (ean) DO UPDATE SET
    qty = GREATEST(0, public.order_items.qty + p_delta),
    category_id = excluded.category_id,
    is_picked = false,
    picked_at = NULL,
    picked_by = NULL,
    store_id = excluded.store_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

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
  ON CONFLICT (ean) DO UPDATE SET
    qty = GREATEST(0, p_qty),
    category_id = excluded.category_id,
    store_id = excluded.store_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- Create function to initialize default preferences for a store (when store is created)
CREATE OR REPLACE FUNCTION public.init_store_category_preferences(p_store_id uuid)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert all global categories with default sort index for this store
  INSERT INTO public.store_category_preferences (store_id, category_id, sort_index)
  SELECT p_store_id, id, sort_index
  FROM public.categories
  WHERE id NOT IN (
    SELECT category_id FROM public.store_category_preferences WHERE store_id = p_store_id
  )
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.init_store_category_preferences(uuid) TO authenticated, anon;
