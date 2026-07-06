-- Ретроактивный пересчёт рейтинговых очков по новой формуле.
--
-- Формула:
--   ratingPoints = coefficient(place) * prizePool / 20 + playerEntries * 100
--
-- Коэффициенты мест: 1=0.28, 2=0.20, 3=0.15, 4=0.11, 5=0.08, 6=0.07, 7=0.06, 8=0.05
-- Места 9+ → coefficient=0, доли от prizePool нет, но playerEntries*100 начисляется всегда.
-- playerEntries = 1 + reentries + addons (для конкретного игрока)
-- prizePool      = "Общий призовой" по структуре турнира (входы/ребаи/аддоны * цены),
--                  а НЕ сумма фактических выплат (winnings).
-- 20             = зафиксированное число игроков (не зависит от фактической явки).
--
-- ВАЖНО про prizePool и поле results.spent:
--   results.spent считается для КАЖДОГО игрока, у которого есть строка в results
--   (т.е. которому проставлено место), НЕЗАВИСИМО от того, отмечен ли он "Пришел".
--   Excel-формула "Общий призовой" считает (C+D)*G + E*H + F*I, где C/D/E/F
--   берутся через SUMIF/COUNTIF по столбцу "Пришел" = TRUE — не-пришедшие
--   (arrived=false) в призовой не входят, даже если им проставлено место.
--   Поэтому SUM(spent) по ВСЕМ строкам results совпадает с Excel, ТОЛЬКО ЕСЛИ
--   в турнире не было no-show. Таблица results вообще не хранит поле arrived —
--   для free-турниров оно нигде не сохраняется (только в теле запроса на завершение),
--   поэтому проверить no-show задним числом можно лишь по самому листу Google Sheets
--   (столбец "Пришел").


-- =====================================================================
-- Турнир "Рейтинг" (05.07 | РЕЙТИНГ | 2021), id = 2021938d-a57e-4162-859d-a05addb0b098
-- kind = free, entryPrice = 3000, addonPrice = 3000, bountyPrice = 0
--
-- Проверено read-only запросом к листу Google Sheets "05.07 | РЕЙТИНГ | 2021":
-- 14 из 14 зарегистрированных игроков отмечены "Пришел" = TRUE, no-show нет.
-- Значит SUM(spent) по всем строкам results для этого турнира точно равна
-- "Общему призовому" из Excel — фильтр по arrived не нужен.
-- =====================================================================

WITH tournament_stats AS (
  SELECT tournament_id, SUM(spent) AS prize_pool
  FROM results
  WHERE tournament_id = '2021938d-a57e-4162-859d-a05addb0b098'
  GROUP BY tournament_id
)
UPDATE results r
SET rating_points = CASE r.place
  WHEN 1 THEN ROUND(0.28 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 2 THEN ROUND(0.20 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 3 THEN ROUND(0.15 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 4 THEN ROUND(0.11 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 5 THEN ROUND(0.08 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 6 THEN ROUND(0.07 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 7 THEN ROUND(0.06 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  WHEN 8 THEN ROUND(0.05 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
  ELSE ROUND((1 + r.reentries + r.addons) * 100)
END
FROM tournament_stats ts
WHERE r.tournament_id = ts.tournament_id
  AND r.tournament_id = '2021938d-a57e-4162-859d-a05addb0b098';

-- Проверка после обновления:
SELECT
  r.player_id,
  r.place,
  r.reentries,
  r.addons,
  r.spent,
  r.rating_points
FROM results r
WHERE r.tournament_id = '2021938d-a57e-4162-859d-a05addb0b098'
ORDER BY r.place;


-- =====================================================================
-- Общий шаблон для будущих турниров (закомментирован).
--
-- Перед использованием проверьте no-show:
--   - для LIVE/PAID турнира — можно восстановить arrived через JOIN на
--     tournament_live_entries (эта таблица не удаляется при завершении турнира);
--   - для FREE турнира — arrived нигде не хранится в БД, единственный способ
--     проверить — прочитать столбец "Пришел" в соответствующем листе Google Sheets.
--     Если no-show были — SQL не даст точного совпадения с Excel, тогда
--     надёжнее повторно завершить турнир через UI.
-- =====================================================================

-- Вариант 1: LIVE/PAID, точный пересчёт с учётом arrived
-- WITH tournament_stats AS (
--   SELECT
--     r.tournament_id,
--     SUM(r.spent) FILTER (WHERE tle.arrived) AS prize_pool
--   FROM results r
--   JOIN tournament_live_entries tle
--     ON tle.tournament_id = r.tournament_id
--    AND tle.player_id = r.player_id
--   WHERE r.tournament_id = '00000000-0000-0000-0000-000000000000'
--   GROUP BY r.tournament_id
-- )
-- UPDATE results r
-- SET rating_points = CASE r.place
--   WHEN 1 THEN ROUND(0.28 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 2 THEN ROUND(0.20 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 3 THEN ROUND(0.15 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 4 THEN ROUND(0.11 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 5 THEN ROUND(0.08 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 6 THEN ROUND(0.07 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 7 THEN ROUND(0.06 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 8 THEN ROUND(0.05 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   ELSE ROUND((1 + r.reentries + r.addons) * 100)
-- END
-- FROM tournament_stats ts
-- WHERE r.tournament_id = ts.tournament_id
--   AND r.tournament_id = '00000000-0000-0000-0000-000000000000';

-- Вариант 2: без фильтра по arrived (только если no-show точно не было)
-- WITH tournament_stats AS (
--   SELECT tournament_id, SUM(spent) AS prize_pool
--   FROM results
--   WHERE tournament_id = '00000000-0000-0000-0000-000000000000'
--   GROUP BY tournament_id
-- )
-- UPDATE results r
-- SET rating_points = CASE r.place
--   WHEN 1 THEN ROUND(0.28 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 2 THEN ROUND(0.20 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 3 THEN ROUND(0.15 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 4 THEN ROUND(0.11 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 5 THEN ROUND(0.08 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 6 THEN ROUND(0.07 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 7 THEN ROUND(0.06 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   WHEN 8 THEN ROUND(0.05 * ts.prize_pool / 20 + (1 + r.reentries + r.addons) * 100)
--   ELSE ROUND((1 + r.reentries + r.addons) * 100)
-- END
-- FROM tournament_stats ts
-- WHERE r.tournament_id = ts.tournament_id
--   AND r.tournament_id = '00000000-0000-0000-0000-000000000000';
