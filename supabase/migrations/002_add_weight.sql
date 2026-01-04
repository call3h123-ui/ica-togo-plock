-- Add weight column to products if not exists
ALTER TABLE products ADD COLUMN IF NOT EXISTS weight text;