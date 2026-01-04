-- Migration: add weight column to products
-- Run this in Supabase SQL editor or via supabase CLI / psql

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS weight text;
