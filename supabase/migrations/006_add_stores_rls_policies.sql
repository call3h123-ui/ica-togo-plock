-- Create RLS policy for stores table to allow admin inserts
-- Since we don't have proper admin authentication yet, we allow public inserts
-- This will be refined later with proper admin authentication

CREATE POLICY "allow_insert_stores" ON public.stores
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "allow_select_stores" ON public.stores
  FOR SELECT
  USING (true);

CREATE POLICY "allow_update_stores" ON public.stores
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
