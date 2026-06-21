const PLACE_COEFFICIENTS: Record<number, number> = {
  1: 0.28,
  2: 0.20,
  3: 0.15,
  4: 0.11,
  5: 0.08,
  6: 0.07,
  7: 0.06,
  8: 0.05,
};

export function calculateRatingPoints(
  place: number,
  totalPrizePool: number,
  totalPlayers: number,
  playerEntries: number
): number {
  const coefficient = PLACE_COEFFICIENTS[place];
  if (!coefficient || totalPlayers === 0) return 0;
  return Math.round(
    (coefficient * totalPrizePool / totalPlayers) + playerEntries * 100
  );
}
