# Quick Task 260407-vlm: Настроить безопасный read-only доступ к таблице tournaments через RLS

**Date:** 2026-04-07
**Status:** Complete

## What Was Done

Created `sql/enable_rls_tournaments_read_only.sql` — ready to execute in Supabase SQL Editor.

## Changes

| File | Action |
|------|--------|
| `sql/enable_rls_tournaments_read_only.sql` | Created — SQL script for RLS setup |

## SQL Commands

```sql
-- 1. Enable RLS (blocks all operations by default)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- 2. Allow SELECT only for anon and authenticated roles
CREATE POLICY "Allow read-only access to tournaments"
  ON public.tournaments
  FOR SELECT
  TO anon, authenticated
  USING (true);
```

## How to Apply

Run `sql/enable_rls_tournaments_read_only.sql` in **Supabase SQL Editor**.

## How to Verify Read-Only Access

After running:

```sql
-- 1. SELECT should work
SELECT id, title, status FROM public.tournaments LIMIT 5;

-- 2. INSERT should fail with RLS error (run manually to confirm)
INSERT INTO public.tournaments (title) VALUES ('test') RETURNING *;

-- 3. View active policies
SELECT * FROM pg_policies WHERE tablename = 'tournaments';
```

## Notes

- `INSERT`, `UPDATE`, `DELETE` are blocked automatically — no explicit deny policies needed
- `service_role` key bypasses RLS by design (used server-side only, this is standard Supabase)
- `anon` key (used by Telegram Mini App clients) is read-only after this migration
