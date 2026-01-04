# ICA ToGo Plock (MVP)

Detta är ett startpaket (Next.js + Supabase) för en rullande beställnings- och plocklista.

## 1) Skapa Supabase-projekt
- Kör SQL-filen: `supabase.sql` i Supabase → SQL Editor.

## 2) Miljövariabler
Skapa `.env.local` i projektroten:

```
NEXT_PUBLIC_SUPABASE_URL=DIN_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=DIN_SUPABASE_ANON_KEY
```

## 3) Installera och kör
```
npm install
npm run dev
```

Öppna http://localhost:3000

## Routes
- `/login` – magic link-inloggning
- `/togo` – ToGo-läge (skanna + qty)
- `/plock` – Liatorp-läge (plock + rensa plockade)
