-- =========================================================
-- Fix categories unique constraint for multi-store support
-- The old constraint was unique on (name) alone, but with multi-store
-- support we need unique on (name, store_id) so each store can have
-- their own categories with the same names
-- =========================================================

-- Drop the old unique constraint on name
ALTER TABLE public.categories DROP CONSTRAINT IF EXISTS categories_name_key;

-- Create new unique constraint on (name, store_id)
-- This allows each store to have their own "Kolonial" category, etc.
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_store 
ON public.categories(name, store_id);

-- Also add a partial unique index for categories without store_id (legacy/global)
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_name_global 
ON public.categories(name) 
WHERE store_id IS NULL;
