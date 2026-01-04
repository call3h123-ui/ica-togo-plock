Migration: add `weight` column to `products`

This folder contains a simple SQL migration to add the `weight` column used by the app.

File:
- `001_add_weight.sql` — ALTER TABLE to add `weight text`.

How to apply

1) Supabase SQL Editor (recommended):
   - Open your Supabase project → SQL Editor → New query.
   - Paste the contents of `001_add_weight.sql` and run.

2) supabase CLI (if configured):

```bash
supabase db query "ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight text;"
```

3) psql (direct DB connection):

```bash
psql "<YOUR_DB_CONNECTION_STRING>" -c "ALTER TABLE public.products ADD COLUMN IF NOT EXISTS weight text;"
```

After applying

- Restart or refresh your dev server (`npm run dev`) so the client schema cache is refreshed.
- Test by adding a new product via the app modal — the `Vikt` value will be saved.

If you want, I can create a second migration file to update any indexes or backfill values.
