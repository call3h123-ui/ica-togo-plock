-- Add email to stores table for self-registration

ALTER TABLE public.stores
ADD COLUMN IF NOT EXISTS email text;

-- Unique email (case-insensitive) when present
CREATE UNIQUE INDEX IF NOT EXISTS uq_stores_email_lower
ON public.stores (lower(email))
WHERE email IS NOT NULL;
