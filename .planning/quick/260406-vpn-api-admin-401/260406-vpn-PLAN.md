---
phase: quick
plan: 260406-vpn-api-admin-401
type: execute
wave: 1
depends_on: []
files_modified:
  - middleware.ts
autonomous: true
must_haves:
  truths:
    - "Admin API requests from Telegram Mini App return 200 (not 401)"
    - "Non-admin users still receive 403 on admin routes"
    - "Requests without initData still receive 401"
  artifacts:
    - path: "middleware.ts"
      provides: "Corrected HMAC verification for Telegram initData"
  key_links:
    - from: "middleware.ts"
      to: "Telegram initData hash"
      via: "HMAC-SHA256 with correct key/data order"
      pattern: "importKey.*WebAppData.*sign.*botToken"
---

<objective>
Fix the HMAC key derivation order in the admin API middleware that causes all /api/admin/* requests to return 401 Unauthorized.

Purpose: The middleware introduced in commit 4c04ec4 has the HMAC arguments swapped — it computes HMAC(key=botToken, data="WebAppData") instead of the correct HMAC(key="WebAppData", data=botToken). This means the computed hash never matches the Telegram-provided hash, so every request fails verification.

Output: Corrected middleware.ts where admin API auth works for valid Telegram initData.
</objective>

<context>
@middleware.ts
@lib/client-request.ts
@app/api/players/[id]/avatar/route.ts (contains the CORRECT working implementation of Telegram initData verification using Node crypto — use as reference for the correct HMAC order)
</context>

<root_cause>
## Confirmed Root Cause: HMAC Key/Data Swapped in middleware.ts

**Working code** (avatar/route.ts line 42):
```typescript
const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
// = HMAC(key="WebAppData", data=botToken) -- CORRECT per Telegram docs
```

**Broken code** (middleware.ts lines 24-36):
```typescript
const botKeyMaterial = importKey("raw", encoder.encode(botToken), ...);
const secretKey = sign("HMAC", botKeyMaterial, encoder.encode("WebAppData"));
// = HMAC(key=botToken, data="WebAppData") -- WRONG, arguments swapped
```

Per Telegram Bot API documentation, the secret key derivation must be:
`secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)`

The middleware swaps key and data, so the computed hash never matches, producing 401 for every request.

**Secondary concern**: If `window.Telegram?.WebApp?.initData` is empty (Telegram SDK not loaded yet), `getAdminHeaders()` in lib/client-request.ts returns `{}` and no header is sent. This should be verified but the HMAC bug is the primary cause since even valid initData fails verification.
</root_cause>

<tasks>

<task type="auto">
  <name>Task 1: Fix HMAC key derivation order in middleware verifyTelegramInitData</name>
  <files>middleware.ts</files>
  <action>
In the `verifyTelegramInitData` function in middleware.ts, fix the secret key derivation.

**Current broken code (lines 24-36):**
```typescript
const botKeyMaterial = await crypto.subtle.importKey(
  "raw", encoder.encode(botToken), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
);
const secretKey = await crypto.subtle.sign(
  "HMAC", botKeyMaterial, encoder.encode("WebAppData")
);
```

**Replace with (swap key and data):**
```typescript
const webAppKeyMaterial = await crypto.subtle.importKey(
  "raw", encoder.encode("WebAppData"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
);
const secretKey = await crypto.subtle.sign(
  "HMAC", webAppKeyMaterial, encoder.encode(botToken)
);
```

This changes the computation from HMAC(key=botToken, data="WebAppData") to the correct HMAC(key="WebAppData", data=botToken), matching the Telegram Bot API specification and the working implementation in avatar/route.ts.

**Also add safe diagnostic logging** in the `middleware` function — add a console.log BEFORE the 401 returns (lines 89-97) to help debug if issues persist. Log only safe metadata, not secrets:

After line 86 (`const initData = ...`), add:
```typescript
if (!initData) {
  console.log("[admin-auth] 401: no x-telegram-init-data header");
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
if (!botToken) {
  console.log("[admin-auth] 401: TELEGRAM_BOT_TOKEN not configured");
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Replace the combined check on line 89-91 with the two separate checks above.

After the `verifyTelegramInitData` call, if telegramId is null, log:
```typescript
if (!telegramId) {
  console.log("[admin-auth] 401: initData verification failed (hash mismatch or expired)", {
    initDataLength: initData.length,
    hasHash: new URLSearchParams(initData).has("hash"),
    hasUser: new URLSearchParams(initData).has("user"),
  });
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

After the player lookup, if player not found, log:
```typescript
if (!player) {
  console.log("[admin-auth] 401: player not found for telegram_id", telegramId);
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
```

Do NOT log the full initData string, bot token, or hash values.
  </action>
  <verify>
    <automated>npx tsc --noEmit middleware.ts 2>&1 || echo "Check manually — tsc may need full project context"</automated>
  </verify>
  <done>
    - HMAC key derivation uses key="WebAppData", data=botToken (matching avatar/route.ts reference)
    - Each 401 return path has a distinct console.log with safe metadata
    - No secrets logged
    - TypeScript compiles without errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Verify fix by deploying and testing admin API</name>
  <files>middleware.ts</files>
  <action>
After the fix in Task 1, verify correctness:

1. Run `npx tsc --noEmit` to confirm no type errors.

2. Do a quick structural review: compare the HMAC derivation in middleware.ts with the known-correct pattern in app/api/players/[id]/avatar/route.ts (line 42). Both must follow: key="WebAppData", data=botToken.

3. Verify `lib/client-request.ts` sends the header correctly:
   - `getAdminHeaders()` reads `window.Telegram?.WebApp?.initData`
   - If non-empty, sends it as `X-Telegram-Init-Data` header
   - The middleware reads `x-telegram-init-data` (case-insensitive in HTTP) — this is correct

4. Check that no other admin route files have their own duplicate initData verification that might also be broken. Search for `verifyTelegram` or `validateTelegram` in app/api/admin/ — if found, they should be removed since middleware handles auth now, OR they should use the same corrected algorithm.

If any admin route has its own inline auth check, note it but do NOT remove it in this task — just confirm it doesn't conflict with the middleware.
  </action>
  <verify>
    <automated>npx tsc --noEmit && echo "TypeScript OK"</automated>
  </verify>
  <done>
    - TypeScript compiles clean
    - HMAC order in middleware.ts matches the reference in avatar/route.ts
    - No conflicting inline auth in admin routes
    - lib/client-request.ts correctly sends X-Telegram-Init-Data header
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- middleware.ts HMAC derivation: importKey("WebAppData") then sign with botToken
- Diagnostic logs present at each 401 path with safe metadata only
- Deploy to Vercel and confirm admin pages load data (no more "Unauthorized")
</verification>

<success_criteria>
- The HMAC key derivation in middleware.ts matches Telegram's specification: HMAC(key="WebAppData", data=botToken)
- Admin API endpoints return data for admin users with valid Telegram initData
- Non-admin users get 403, unauthenticated requests get 401
- Server logs show distinct reason for any remaining 401s
</success_criteria>
