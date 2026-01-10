-- Add logo_url column to stores table to support store-specific branding
ALTER TABLE public.stores ADD COLUMN logo_url text DEFAULT NULL;
