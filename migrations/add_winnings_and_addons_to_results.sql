-- Migration: добавить поля winnings, addons, spent в results
-- и winnings в tournament_live_entries
--
-- Где выполнить: Supabase Dashboard → SQL Editor, или psql.
-- Применять вручную, не автоматически.

-- 1. Поле "Выигрыш" в таблице results
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS winnings integer NOT NULL DEFAULT 0;

-- 2. Поле addons в таблице results
--    (раньше addons хранились только в tournament_live_entries и GS,
--     теперь также денормализуем в results для агрегированной статистики)
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS addons integer NOT NULL DEFAULT 0;

-- 3. Поле spent в таблице results
--    Хранит предрасчитанную сумму взносов игрока за турнир:
--    (1 + reentries) * entry_price + addons * addon_price + knockouts * bounty_price
--    Рассчитывается при завершении турнира и сохраняется денормализованно,
--    чтобы агрегация по листу "результаты игроков" не требовала обращения к GS.
ALTER TABLE results
  ADD COLUMN IF NOT EXISTS spent integer NOT NULL DEFAULT 0;

-- 4. Поле "Выигрыш" в таблице tournament_live_entries (для live/paid/cash турниров)
ALTER TABLE tournament_live_entries
  ADD COLUMN IF NOT EXISTS winnings integer NOT NULL DEFAULT 0;
