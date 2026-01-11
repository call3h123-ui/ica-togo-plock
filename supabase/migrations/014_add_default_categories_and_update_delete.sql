-- =========================================================
-- Add default categories and update delete behavior
-- =========================================================

-- Step 1: Create default categories if they don't exist
INSERT INTO public.categories (name, sort_index)
VALUES 
  ('Övrigt', 999),
  ('Ospecificerad', 1000)
ON CONFLICT DO NOTHING;

-- Step 2: Create trigger to move products to "Övrigt" when category is deleted
CREATE OR REPLACE FUNCTION public.move_products_to_ovrigt()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_ovrigt_id UUID;
BEGIN
  -- Get the "Övrigt" category ID
  SELECT id INTO v_ovrigt_id FROM public.categories WHERE name = 'Övrigt' LIMIT 1;
  
  IF v_ovrigt_id IS NOT NULL THEN
    -- Move all products from deleted category to "Övrigt"
    UPDATE public.products
    SET default_category_id = v_ovrigt_id
    WHERE default_category_id = OLD.id;
    
    -- Move all order_items from deleted category to "Övrigt"
    UPDATE public.order_items
    SET category_id = v_ovrigt_id
    WHERE category_id = OLD.id;
  END IF;
  
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_move_products_to_ovrigt ON public.categories;
CREATE TRIGGER trg_move_products_to_ovrigt
  BEFORE DELETE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.move_products_to_ovrigt();

-- Step 3: Create trigger to auto-add new categories to all stores' preferences
CREATE OR REPLACE FUNCTION public.add_category_to_all_stores()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Add this category to all existing stores' preferences
  INSERT INTO public.store_category_preferences (store_id, category_id, sort_index)
  SELECT s.id, NEW.id, NEW.sort_index
  FROM public.stores s
  ON CONFLICT (store_id, category_id) DO NOTHING;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_category_to_all_stores ON public.categories;
CREATE TRIGGER trg_add_category_to_all_stores
  AFTER INSERT ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.add_category_to_all_stores();

-- Step 4: Initialize preferences for existing stores with new default categories
SELECT init_store_category_preferences(id) FROM public.stores;
