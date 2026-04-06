---
phase: quick
plan: 260406-vpn-api-admin-401
subsystem: middleware / auth
tags: [bugfix, hmac, telegram, admin-auth]
dependency_graph:
  requires: []
  provides: [admin-api-auth-working]
  affects: [all /api/admin/* routes]
tech_stack:
  added: []
  patterns: [Web Crypto API HMAC-SHA256, Telegram initData verification]
key_files:
  modified:
    - middleware.ts
decisions:
  - "Used Web Crypto API (crypto.subtle) matching existing middleware pattern rather than switching to Node crypto like avatar/route.ts — keeps Edge Runtime compatibility"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-06"
  tasks_completed: 2
  files_modified: 1
---

# Quick Task 260406-vpn: Fix Admin API 401 (HMAC Key/Data Swap)

**One-liner:** Fixed swapped HMAC arguments in middleware.ts — key="WebAppData", data=botToken now matches Telegram spec, resolving 401 for all /api/admin/* routes.

## Problem

All `/api/admin/*` requests returned 401 Unauthorized despite valid Telegram initData. Root cause: HMAC key and data were swapped in `verifyTelegramInitData`.

**Broken (before fix):**
```
HMAC(key=botToken, data="WebAppData")  -- wrong
```

**Correct (after fix, per Telegram Bot API spec):**
```
HMAC(key="WebAppData", data=botToken)  -- correct
```

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Fix HMAC key derivation order + add diagnostic logging | 5b961ff |
| 2 | Verify TypeScript, check for conflicting inline auth | (same commit) |

## Changes Made

**middleware.ts** — `verifyTelegramInitData` function:
- Renamed `botKeyMaterial` → `webAppKeyMaterial`, now imports `"WebAppData"` as key
- `crypto.subtle.sign` now takes `botToken` as data (was `"WebAppData"`)
- Split combined `!initData || !botToken` check into two separate checks
- Added `console.log` at each 401 return path with safe metadata (no secrets logged)
- Added `console.log` at player-not-found 401 path

## Verification

- TypeScript: pre-existing errors in `pull-sheet/route.ts` and `lib/google-sheets.ts` (unrelated, pre-existing). middleware.ts itself has no type errors.
- No duplicate inline Telegram auth found in any `/app/api/admin/` route files.
- `lib/client-request.ts` correctly sends `X-Telegram-Init-Data` header when `window.Telegram?.WebApp?.initData` is non-empty.
- HMAC order in middleware.ts now matches the reference implementation in `app/api/players/[id]/avatar/route.ts` (line 42).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- middleware.ts modified: confirmed
- Commit 5b961ff: confirmed
