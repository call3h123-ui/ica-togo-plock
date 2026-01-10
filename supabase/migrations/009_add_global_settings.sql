-- Create global_settings table for app-wide settings
-- This table stores settings like the login page logo

CREATE TABLE IF NOT EXISTS public.global_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login_logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.global_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read global settings (needed for login page)
CREATE POLICY "Anyone can read global settings" ON public.global_settings
  FOR SELECT USING (true);

-- Only allow updates/inserts via service role (admin API)
-- The API will use the service role key, so no policy needed for mutations

-- Insert default row if not exists
INSERT INTO public.global_settings (login_logo_url)
SELECT NULL
WHERE NOT EXISTS (SELECT 1 FROM public.global_settings);
