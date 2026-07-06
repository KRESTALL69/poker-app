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

// Рейтинг всегда делится на фиксированное число игроков, а не на фактическое
// количество участников турнира — так рейтинг не зависит от явки.
export const FIXED_PLAYERS_COUNT = 20;

export function getPlaceCoefficient(place: number): number {
  return PLACE_COEFFICIENTS[place] ?? 0;
}

// prizePool — это "Общий призовой" по структуре турнира (входы/ребаи/аддоны * их цены),
// а не сумма фактических выплат (winnings). Считается ТОЛЬКО по игрокам с arrived=true —
// как в Excel-формуле (SUMIF/COUNTIF по столбцу "Пришел"). Не-пришедшие в призовой не входят.
//
// Места 9+ не получают долю от prizePool (coefficient=0), но playerEntries*100
// начисляется всегда — рейтинг за сами входы/ребаи/аддоны не обнуляется.
export function calculateRatingPoints(
  place: number,
  prizePool: number,
  playerEntries: number
): number {
  const coefficient = getPlaceCoefficient(place);
  return Math.round(
    (coefficient * prizePool) / FIXED_PLAYERS_COUNT + playerEntries * 100
  );
}
