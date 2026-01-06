-- Enable RLS on all public tables that have policies defined
-- These policies were already created in 004_add_multi_store.sql
-- We're just enabling RLS to activate them

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

