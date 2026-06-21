-- Добавляет NOT NULL constraint на tournaments.season_id и results.season_id.
--
-- ВАЖНО: перед запуском убедись, что нет строк с season_id = NULL:
--
--   SELECT id, title, season_id FROM tournaments WHERE season_id IS NULL;
--   SELECT id, tournament_id, season_id FROM results WHERE season_id IS NULL;
--
-- Если такие строки есть — обнови их вручную перед применением этой миграции.

ALTER TABLE tournaments
  ALTER COLUMN season_id SET NOT NULL;

ALTER TABLE results
  ALTER COLUMN season_id SET NOT NULL;
