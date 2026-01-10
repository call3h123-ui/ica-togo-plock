-- Add DELETE policy for stores table
-- Allows deletion of stores (admin functionality)

CREATE POLICY "allow_delete_stores" ON public.stores
  FOR DELETE
  USING (true);
