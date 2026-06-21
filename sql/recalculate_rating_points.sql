-- Ретроактивный пересчёт рейтинговых очков по новой формуле.
--
-- Формула:
--   ratingPoints = coefficient(place) * totalPrizePool / totalPlayers + playerEntries * 100
--
-- Коэффициенты мест: 1=0.28, 2=0.20, 3=0.15, 4=0.11, 5=0.08, 6=0.07, 7=0.06, 8=0.05
-- Места 9+ → 0 очков.
-- playerEntries = 1 + reentries + addons (для конкретного игрока)
-- totalPrizePool = SUM(winnings) по турниру
-- totalPlayers   = COUNT(*) участников турнира

WITH tournament_stats AS (
  SELECT
    tournament_id,
    SUM(winnings)  AS total_prize_pool,
    COUNT(*)       AS total_players
  FROM results
  GROUP BY tournament_id
)
UPDATE results r
SET rating_points = CASE r.place
  WHEN 1 THEN ROUND(0.28 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 2 THEN ROUND(0.20 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 3 THEN ROUND(0.15 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 4 THEN ROUND(0.11 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 5 THEN ROUND(0.08 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 6 THEN ROUND(0.07 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 7 THEN ROUND(0.06 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  WHEN 8 THEN ROUND(0.05 * ts.total_prize_pool / ts.total_players + (1 + r.reentries + r.addons) * 100)
  ELSE 0
END
FROM tournament_stats ts
WHERE r.tournament_id = ts.tournament_id;

-- Проверка после обновления:
SELECT
  r.tournament_id,
  r.player_id,
  r.place,
  r.reentries,
  r.addons,
  r.winnings,
  r.rating_points,
  ts.total_prize_pool,
  ts.total_players
FROM results r
JOIN (
  SELECT tournament_id, SUM(winnings) AS total_prize_pool, COUNT(*) AS total_players
  FROM results GROUP BY tournament_id
) ts ON r.tournament_id = ts.tournament_id
ORDER BY r.tournament_id, r.place;
