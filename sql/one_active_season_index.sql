-- Гарантирует на уровне БД, что одновременно может существовать
-- только один активный сезон (is_active = true).
--
-- После применения любая попытка установить is_active = true
-- второму сезону завершится ошибкой уникальности,
-- даже через прямой SQL INSERT/UPDATE.

CREATE UNIQUE INDEX one_active_season
  ON seasons (is_active)
  WHERE is_active = true;
