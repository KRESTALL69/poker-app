# Backfill Supabase → PostgreSQL: runbook

> **АРХИВ — backfill и cutover выполнены, Supabase-проект выведен из
> эксплуатации.** Скрипты (`scripts/backfill-supabase-to-postgres.mjs`,
> `scripts/validate-postgres-backfill.mjs`) сегодня нерабочие — Supabase,
> из которого они читали данные, больше не существует. Документ оставлен как
> историческая запись протокола переноса (snapshot+delta, порядок импорта,
> откат) на случай похожей задачи в будущем, не как исполняемая инструкция.

Статус (на момент написания): **черновик, backfill выполняется поэтапно, cutover не входит в объём**. Дополняет `docs/MIGRATION_PLAN.md` (Этап 2) и `docs/POSTGRES_MIGRATION_ARCHITECTURE.md`.

---

## Скрипты

- `scripts/lib/backfill-tables.mjs` — единый реестр из 9 таблиц (колонки, PK, FK-порядок) для обоих скриптов ниже, чтобы они не могли разойтись в том, какие колонки существуют.
- `scripts/backfill-supabase-to-postgres.mjs` — читает Supabase (service-role, read-only), пишет в PostgreSQL через `INSERT ... ON CONFLICT (pk) DO UPDATE`. Поддерживает `--dry-run`. Безопасен при повторном запуске: PK всегда исходный, новые id никогда не генерируются, `TRUNCATE`/`DELETE`/`DROP` в коде нет вообще.
- `scripts/validate-postgres-backfill.mjs` — 4 уровня проверки паритета (row counts, PK sets, checksums, бизнес-инварианты), полностью read-only с обеих сторон.

Обе команды требуют `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` в окружении и **отказываются работать**, если `current_database()` ≠ `poker_app`.

---

## Порядок импорта (FK-safe)

`players → seasons → tournaments → registrations → results → player_achievements → app_settings → activity_events → tournament_live_entries`.

Проверено против `lib/db/schema.ts`: `players` не имеет исходящего FK на `seasons` (только self-FK `blocked_by`, обрабатывается отдельным вторым проходом после основного upsert — так конкретная позиция `players` в списке относительно `seasons` не важна). `tournaments` зависит от `seasons.id` (nullable) — поэтому идёт после. Остальной порядок — прямое следствие FK-графа.

## Конфликт-семантика

Для всех 9 таблиц conflict target — сам PK (`id`, для `app_settings` — `key`), потому что исходные UUID/ключи сохраняются как есть. Проверено: ни для одной таблицы нет неоднозначности между несколькими кандидатами (PK либо единственный UNIQUE, значимый для upsert).

---

## Snapshot + Delta (защита от параллельных изменений)

Выбран **Вариант A**, как и было согласовано. Production Supabase продолжает принимать запись всё это время — текущий backfill не финально консистентен, пока приложение пишет в Supabase.

- **Snapshot timestamp** — фиксируется в начале запуска backfill-скрипта (печатается в лог первой строкой, `Backfill snapshot started at <ISO>`). Это момент, "после которого" могли появиться расхождения.
- **Таблицы с `updated_at`**: `app_settings`, `player_achievements`, `tournament_live_entries`. Для них delta-синхронизация перед cutover — `WHERE updated_at > snapshot_timestamp`, тот же скрипт `backfill-supabase-to-postgres.mjs` безопасно повторно перезапустить целиком (upsert идемпотентен) — не обязательно писать отдельный delta-only режим для них.
- **Таблицы без `updated_at`** (`players`, `seasons`, `tournaments`, `registrations`, `results`, `activity_events`): для строк, которые не удаляются, а только создаются или обновляются в узком наборе полей (например, `players.custom_avatar_url`, `players.is_blocked`), `created_at` не меняется при update — полагаться на него для delta нельзя. Перед реальным cutover необходимо либо (а) добавить `updated_at` в эти таблицы отдельной, согласованной миграцией — вне объёма этой задачи, либо (б) выполнить финальный повторный полный backfill (весь скрипт целиком, не delta) непосредственно перед переключением, приняв на себя стоимость полного прогона (по объёму сегодняшних данных — секунды/минуты, не часы).
- **Обнаружение удалений**: ни backfill, ни validate скрипт не удаляют строки в PostgreSQL, которых нет в Supabase — удаления в Supabase сегодня не отслеживаются автоматически. Level 2 (PK sets) в `validate-postgres-backfill.mjs` показывает `extra_in_postgres` — строки, присутствующие в PostgreSQL, но отсутствующие в Supabase на момент проверки; это единственный сегодняшний способ обнаружить, что что-то было удалено в Supabase после последнего backfill. Перед cutover — вручную свериться с этим списком (ожидается пустым при пустой истории удалений).
- **Что нужно непосредственно перед cutover**: (1) финальный полный прогон `backfill-supabase-to-postgres.mjs` (не delta, из-за таблиц без `updated_at`); (2) `validate-postgres-backfill.mjs` без единого расхождения на всех 4 уровнях; (3) короткое окно, где запись в Supabase либо приостановлена, либо принимается решение о допустимом расхождении на секунды между финальным backfill и флипом `DATABASE_PROVIDER` — это отдельное решение Этапа 4 `MIGRATION_PLAN.md`, не часть этой задачи.

---

## Rollback

Backfill в PostgreSQL никогда не изменяет и не удаляет ничего в Supabase — Supabase остаётся источником истины и полностью работоспособен на всём протяжении. Откат самого backfill: `poker_app` можно опустошить (`TRUNCATE` всех 9 таблиц) и прогнать заново — это единственная деструктивная операция во всей цепочке, и она выполняется только по отдельному решению, не автоматически.

---

## Известные ограничения

- Delta-синхронизация для таблиц без `updated_at` не автоматизирована этим этапом — см. раздел выше.
- Проверка орфанных FK/дублей (`docs/BACKFILL_RUNBOOK.md` уровень 4) не покрывает `RLS`-специфичные сценарии Supabase — RLS не переносится в PostgreSQL (уже задокументировано в `POSTGRES_MIGRATION_AUDIT.md`, не блокирует backfill).
