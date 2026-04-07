---
phase: quick-260407-vw0
plan: "01"
subsystem: features
tags: [waitlist, admin, tournaments, registration]
dependency_graph:
  requires: []
  provides: [waitlist-promotion-on-admin-removal]
  affects: [features/tournaments.ts]
tech_stack:
  added: []
  patterns: [supabase-query, waitlist-promotion]
key_files:
  modified: [features/tournaments.ts]
decisions:
  - Mirror cancelPlayerRegistration waitlist promotion pattern exactly in removeAdminTournamentParticipant
metrics:
  duration: "5m"
  completed: "2026-04-07"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-260407-vw0 Plan 01: Waitlist Promotion on Admin Participant Removal Summary

**One-liner:** Added waitlist auto-promotion to `removeAdminTournamentParticipant` so admin removal of a registered player triggers the same first-waitlist-player promotion as player self-cancellation.

## What Was Built

`removeAdminTournamentParticipant` in `features/tournaments.ts` now:
1. Fetches the registration's `status` and `tournament_id` before deleting
2. Performs the existing hard DELETE
3. If the removed player had status `"registered"`, queries for the earliest waitlist player (by `created_at ASC`) and promotes them to `"registered"`
4. If the removed player was on waitlist or another status, no promotion occurs

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add waitlist promotion to removeAdminTournamentParticipant | 4a93cb1 | features/tournaments.ts |

## Decisions Made

- Mirrored the exact pattern from `cancelPlayerRegistration` (lines 408-432) to ensure consistent waitlist promotion logic across both admin and player-initiated removals.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None - no new network endpoints, auth paths, or trust boundaries introduced.

## Self-Check: PASSED

- features/tournaments.ts modified: FOUND
- Commit 4a93cb1: FOUND
- TypeScript errors are pre-existing in unrelated files (pull-sheet/route.ts, lib/google-sheets.ts), not introduced by this change
