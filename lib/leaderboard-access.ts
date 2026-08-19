// Visibility rule for the "Призовой фонд сезона" card on /leaderboard.
// Reuses the same source of truth as the "Платные" filter on /tournaments
// (player.can_access_paid) -- no separate permission flag/system.
export function canSeePrizePoolCard(
  player: { can_access_paid?: boolean } | null | undefined
): boolean {
  return Boolean(player?.can_access_paid);
}
