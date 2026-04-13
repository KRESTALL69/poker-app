# Quick Task 260413-ul5: Добавить удаление manual игроков в модерации ников

**Date:** 2026-04-13
**Status:** Completed

## What was done

Added delete functionality for manual players (telegram_id = null) in the "Модерация ников" admin tab.

## Changes

### features/admin.ts
- Added `deleteManualPlayer(playerId)` function
- Server-side guard: checks `telegram_id IS NULL` before deletion
- Deletes related records in FK order before deleting the player

### app/api/admin/players/[id]/route.ts (new file)
- `DELETE` handler calling `deleteManualPlayer`
- Returns `{success: true}` or 500 with error message

### app/admin/moderation/page.tsx
- Added `handleDeleteManualPlayer` with confirm dialog
- Optimistic UI update via `setPlayers` filter after deletion
- Red "Удалить" button rendered only when `!player.telegram_id`

## Commits
- `898a002` feat(quick-260413-ul5-manual-01): add deleteManualPlayer and DELETE route
- `3c05ed8` feat(quick-260413-ul5-manual-01): add delete button for manual players in moderation catalog
