-- Включаем Row Level Security для таблицы tournaments.
-- После этого все операции (SELECT, INSERT, UPDATE, DELETE) запрещены по умолчанию,
-- пока явно не созданы соответствующие policies.
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Разрешаем SELECT для всех (anon и authenticated).
-- INSERT, UPDATE, DELETE остаются запрещёнными — явных policies для них нет.
CREATE POLICY "Allow read-only access to tournaments"
  ON public.tournaments
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Проверка после выполнения:
--
-- 1. Убедиться, что данные читаются:
-- SELECT id, title, status FROM public.tournaments LIMIT 5;
--
-- 2. Убедиться, что запись запрещена (выполнить вручную — должна вернуть ошибку):
-- INSERT INTO public.tournaments (title) VALUES ('test') RETURNING *;
--
-- 3. Просмотреть активные policies на таблице:
-- SELECT * FROM pg_policies WHERE tablename = 'tournaments';
