# Copilot Instructions for ICA ToGo Plock

## Project Overview
- **Stack:** Next.js (TypeScript) + Supabase (PostgreSQL)
- **Purpose:** Rolling order and picking list for ICA stores, supporting both ToGo (scanning/quantity) and Plock (picking/clearing) workflows.

## Key Architecture & Data Flow
- **Frontend:**
  - Located in `src/app/` (Next.js App Router)
  - Main routes: `/login`, `/togo`, `/plock`, `/admin`
  - API routes: `src/app/api/` (e.g., `auth`, `stores`, `admin`)
- **Backend:**
  - Supabase SQL schema in `supabase.sql` and migrations in `supabase/migrations/`
  - Data access via `src/lib/supabase.ts` and `src/lib/data.ts`

## Developer Workflows
- **Setup:**
  - Run `npm install` and `npm run dev` to start the app at http://localhost:3000
  - Set up `.env.local` with Supabase credentials (see `README.md`)
- **Database:**
  - Apply schema with `supabase.sql` or use migration files in `supabase/migrations/`
  - After DB changes, restart dev server to refresh schema
- **Testing:**
  - Manual: Add products via app modal to test DB changes (see `supabase/migrations/README.md`)

## Project-Specific Patterns
- **API routes** use Next.js App Router conventions (`route.ts` in nested folders)
- **Supabase** is the only backend; no custom server code
- **TypeScript types** for data in `src/lib/types.ts`
- **Store-specific logic**: Multi-store support, case-insensitive logins, and RLS policies (see migrations)

## Integration Points
- **Supabase:** All data and auth via Supabase; see `src/lib/supabase.ts`
- **Environment:** Only `.env.local` is required for local dev

## Notable Files & Directories
- `src/app/` — Main app routes and pages
- `src/lib/` — Data access, types, and Supabase client
- `supabase/` — SQL schema and migrations
- `README.md` — Setup and usage instructions

## Example: Adding a New Product
1. Update DB schema if needed (edit migration or `supabase.sql`)
2. Restart dev server
3. Use the app modal to add a product and verify DB changes

---

For more details, see `README.md` and `supabase/migrations/README.md`.
