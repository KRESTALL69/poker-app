# Auth Migration: Supabase Auth → self-hosted OTP + sessions

Poker App no longer depends on Supabase in any form. This was the last
remaining piece (Database and Storage were already migrated — see
`docs/POSTGRES_MIGRATION_ARCHITECTURE.md` and the Storage section of
`docs/POSTGRES_MIGRATION_AUDIT.md`). The architecture below is ported
from ReRaise, which had already completed the same migration.

## What changed

| Before | After |
|---|---|
| `supabase.auth.signInWithOtp` / `verifyOtp` (client-side) | `POST /api/auth/email/request-code` + `POST /api/auth/email/verify-code` |
| Supabase session (JWT, `X-Supabase-Token` header) | Signed `dwc_tg_session` cookie (HMAC-SHA256, same mechanism already used by the Telegram OAuth widget login) |
| `supabase.auth.getSession()` / `getUser()` | `GET /api/auth/me` (reads the cookie) |
| — (no logout existed) | `POST /api/auth/logout` |
| `@supabase/supabase-js` for Auth + as a DB/Storage rollback fallback | Removed entirely — `resend` is the only new dependency |

## OTP system

- Table: `email_otp_codes` (`lib/db/schema.ts`) — `email`, `purpose` (`login` \| `link_email`), nullable `player_id`, `code_hash`, `expires_at`, `resend_after_at`, `failed_attempts`, `consumed_at`.
- Business logic: `lib/email-otp.ts` — 6-digit code, `sha256(email:purpose:code:SESSION_SECRET)` hash (compared with `timingSafeEqual`, one hardening beyond ReRaise's plain `!==`), 10-minute TTL, 60-second resend cooldown, 5 max failed attempts, single-use via `consumed_at`.
- Repository: `lib/repositories/email-otp/` (`Interface.ts` + `PostgresEmailOtpRepository.ts` + `index.ts`) — same triplet pattern as every other domain. No Supabase fallback exists here: OTP codes were never a Supabase table, so there's nothing to roll back to.
- Email delivery: `lib/resend.ts`, using the `resend` npm package. Env vars `RESEND_API_KEY` and `EMAIL_FROM`.

## Two purposes, one engine

- **`login`** — the `/login` page (web, no Telegram). Anyone can request a code for any email; verifying it finds-or-creates a player (`ensurePlayerFromEmail`).
- **`link_email`** — reachable only from inside the Telegram Mini App (adding an email to an already-known Telegram player, for later web access). Since the Mini App has no session cookie, `request-code` re-verifies the caller's identity via the `x-telegram-init-data` header (same HMAC check as `middleware.ts`) and stores the resolved `player_id` on the OTP row itself — so `verify-code` doesn't need to re-verify Telegram identity a second time.

## Sessions

- Cookie: `dwc_tg_session` (`lib/telegram-web-session.ts`) — `"<playerId>.<hmac-sha256-hex>"`, `httpOnly`, `secure` in production, `sameSite: "lax"`, 30-day `maxAge`. This module already existed (it backed the pre-existing Telegram OAuth widget login) — the OTP `verify-code` route now sets the same cookie, unifying both web login paths under one mechanism.
- No session table — the cookie is the session. Logout (`POST /api/auth/logout`) just clears it; there was nothing to invalidate server-side because there was nothing stored server-side.

## Middleware

`middleware.ts` guards `/api/admin/*`. It resolves the caller's identity two ways — `x-telegram-init-data` header (Mini App) or the `dwc_tg_session` cookie (web) — then makes exactly one `playerRepository` call to check `role === "admin"`. `runtime: "nodejs"` is required because the Postgres path uses real TCP sockets, unavailable in the default Edge runtime.

## What was NOT changed

- **Realtime** and the general shape of dual auth (Telegram vs. web) — out of scope for this migration; see `docs/POSTGRES_MIGRATION_AUDIT.md`'s Realtime section for that separate, still-open question.
- ReRaise's OTP design was ported close to verbatim (schema, TTL, rate limiting, hashing) rather than redesigned, per the explicit instruction to reuse a proven architecture. The one deliberate improvement is the timing-safe hash comparison noted above.

## Removed

- `lib/supabase.ts`, `lib/supabase-admin.ts`
- All 9 `Supabase*Repository.ts` fallback classes (player, tournament, registration, result, season, achievement, activity, app-settings, tournament-live-state) and `SupabaseAvatarStorageRepository.ts`
- `lib/repositories/provider.ts` and the `DATABASE_PROVIDER` env var — with no Supabase implementation left to switch to, the provider switch had nothing left to do
- `app/api/auth/email-link/prepare/route.ts` — superseded by `/api/auth/email/request-code` with `purpose: "link_email"`
- `@supabase/supabase-js` dependency
