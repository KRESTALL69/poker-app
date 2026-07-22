# Аудит текущей схемы Supabase перед проектированием PostgreSQL/Drizzle

> **АРХИВ — миграция завершена, Supabase полностью выведен из эксплуатации.**
> Этот аудит сравнивал схему Supabase с проектируемой схемой PostgreSQL перед
> переносом; сегодня Supabase-проект и все Supabase-реализации Repository
> удалены из кодовой базы. Документ ценен только как историческая запись
> найденных особенностей схемы (мёртвые колонки, отсутствующие FK и т.п.),
> перенесённых в `lib/db/schema.ts` осознанно как есть. Актуальная схема —
> `lib/db/schema.ts`, актуальная архитектура — `README.md`.

Статус (на момент написания): **read-only аудит, шаг 1 этапа PostgreSQL migration** (см. `docs/POSTGRES_MIGRATION_ARCHITECTURE.md`, Migration strategy). Ни одна DDL/DML-команда не выполнялась. Drizzle не устанавливался, `lib/db` не создавался, схема и миграции не писались, ни один `Postgres*Repository` не создавался, production-код не менялся.

## Как читать этот документ

MCP-доступ к Supabase проекту Poker App был первоначально заблокирован (токен был scoped на другую организацию), но переавторизован в ходе этой же сессии — все разделы ниже построены на **реальном read-only аудите БД** (`list_tables`, `execute_sql` только с `SELECT`, `get_advisors`, `list_extensions`, `list_migrations`), а не на предположениях по коду. Там, где что-то всё же осталось неподтверждённым (redundant по объёму проверки, не по доступу), это явно помечено **Unverified**.

Каждый раздел разделяет:
- **Confirmed from database** — подтверждено прямым запросом к `information_schema`/`pg_catalog`/данным.
- **Confirmed from code** — установлено чтением `Supabase*Repository.ts`, `types/database.ts`, `types/domain.ts`, `features/*.ts`, `middleware.ts`.
- **Unverified** — единичные оставшиеся пункты, для которых дан конкретный SQL-запрос.

---

## ⚠️ Критическая находка: RLS отключён на 7 из 9 таблиц

Обнаружено `get_advisors`/`list_tables` (уровень `ERROR` у самого Supabase-линтера, не моя оценка): **Row Level Security отключён** на `players`, `seasons`, `tournaments`, `registrations`, `results`, `player_achievements`, `tournament_live_entries`. Это означает, что `anon`-ключ (публичный, зашитый в клиентский бандл через `NEXT_PUBLIC_SUPABASE_ANON_KEY`) сегодня может как читать, так и **писать в любую строку** этих 7 таблиц напрямую через Supabase REST API — в обход всего приложения, всех проверок `middleware.ts` и Feature-слоя.

Это объясняет находку предыдущей (код-only) версии этого аудита: 7 из 10 Repository пишут через `anon`-клиент, и это работает в проде именно потому, что RLS выключен, а не потому что есть permissive-политики (их вообще нет ни одной на этих 7 таблицах — `pg_policies` пуст для всех, кроме `app_settings`).

Это **не следствие Postgres-миграции** и не было внесено сейчас — это существующее состояние прод-базы. Я не применяю никакой fix — вот что предлагает сам Supabase (только для ознакомления, решение о применении и о политиках — за вами):

```sql
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_live_entries ENABLE ROW LEVEL SECURITY;
```

**Внимание:** включение RLS без политик на этих таблицах немедленно сломает приложение — весь текущий код обращается к ним через `anon`-ключ и не имеет ни одной RLS-политики, которая разрешила бы что-либо. Это отдельная задача (написать политики, эквивалентные текущей проверке доступа в коде), не связанная с Postgres-миграцией напрямую, и не должна решаться в рамках этого этапа без отдельного решения.

**Практическое следствие для Postgres-миграции:** поскольку RLS не используется содержательно нигде, кроме одной SELECT-политики на `app_settings` (см. ниже), Drizzle-реализациям не придётся воспроизводить никакую скрытую бизнес-логику из RLS — весь контроль доступа сегодня и так целиком на стороне приложения (`middleware.ts` + Feature). Это хорошая новость для самой миграции, при том что находка остаётся серьёзной сама по себе.

---

## Executive summary

- 9 таблиц данных + 1 Storage-bucket (`avatars`), используемые всеми 10 Repository.
- Все `Row`-типы (`types/database.ts`) и все `select()`-списки колонок в `Supabase*Repository.ts` подтверждены соответствующими реальной схеме — расхождений между тем, что код ожидает, и тем, что реально есть в БД, не найдено.
- RLS отключён на 7/9 таблиц (см. врезку выше) — критическая, но не блокирующая Postgres-миграцию находка.
- **Composite unique constraints, которые я предполагал как "неподтверждённые бизнес-инварианты", реально существуют в БД**: `players.telegram_id` (unique), `players` — функциональный уникальный индекс `lower(email)` (case-insensitive, совпадает с `normalizeEmail()` в `features/auth.ts`), `registrations(player_id, tournament_id)`, `results(tournament_id, player_id)`, `results(tournament_id, place)`, `tournament_live_entries(tournament_id, player_id)`, `seasons(is_active) WHERE is_active = true` (партиционный — гарантирует ровно один активный сезон на уровне БД, не только в коде, как я предполагал раньше).
- **CHECK-констрейнты закрывают все "enum-подобные" текстовые колонки, где список закрыт кодом**: `players.role IN ('player','admin')`, `tournaments.status IN (...)`, `tournaments.kind IN (...)`, `registrations.status IN (...)`, `tournaments.max_players > 0`, `results.place > 0`, `results.rating_points >= 0`, `player_achievements.current_value >= 0`. Ни одного Postgres `enum`-типа — везде `text` + `CHECK`.
- **Найдено 3 мёртвые колонки в `players`** — `requires_prepayment`, `no_show_count`, `last_no_show_at` — существуют в БД, но отсутствуют в `types/database.ts::PlayerRow` целиком: ни один Repository-метод их не читает и не пишет. Формально брошенная фича "неявка игрока" — точное зеркало находки у ReRaise.
- **`results.season_id` — денормализация БЕЗ FK**, подтверждено (`results` имеет только `results_player_id_fkey` и `results_tournament_id_fkey`, `results_season_id_fkey` не существует) — ровно как предполагалось по аналогии с ReRaise.
- **Один найденный редундантный индекс** (не 6, как у ReRaise, но один есть): `idx_players_telegram_id` (обычный btree) полностью избыточен рядом с `players_telegram_id_key` (тот же столбец, но `UNIQUE`) — второй индекс уже покрывает все точечные обращения первого.
- Ни триггеров, ни функций в схеме `public` не существует — подтверждено пустым результатом обоих запросов к `information_schema`. Ручное управление `updated_at`/`created_at` в коде — не избыточная предосторожность, это единственный механизм, который вообще есть.
- `event_type`/`achievement_code` подтверждены как свободный текст без БД-enum — но реальные данные показывают, что оба поля **на практике** содержат только предсказуемый, закрытый набор значений (11 и 5 соответственно) — свобода схемы используется, но не превращается в мусор.
- `avatars` bucket подтверждён публичным (`public: true`).
- Миграции через Supabase CLI не использовались (`list_migrations` вернул пустой список) — вся схема, судя по всему, создана напрямую (SQL Editor/Dashboard), без сохранённой истории миграций на стороне Supabase.

---

## Scope

Аудируются 9 таблиц, обслуживающих 10 Repository, плюс Storage:

| Repository | Таблица(ы) |
|---|---|
| `AppSettingsRepository` | `app_settings` |
| `ActivityRepository` | `activity_events` |
| `AvatarStorageRepository` | Storage bucket `avatars` (не таблица) |
| `SeasonRepository` | `seasons` |
| `AchievementRepository` | `player_achievements` |
| `PlayerRepository` | `players` |
| `RegistrationRepository` | `registrations` (+ embedded `players` в 6 JOIN-методах) |
| `TournamentLiveStateRepository` | `tournament_live_entries` (+ embedded `registrations`, `players`) |
| `ResultRepository` | `results` (+ embedded `players` в 3 методах) |
| `TournamentRepository` | `tournaments` |

Не входит в этот аудит (сознательно вне Repository Layer, см. `MIGRATION_PLAN.md` Этап 0): Supabase Auth (`auth.*` — Poker App использует `supabase.auth.*` напрямую для email-входа, не собственную таблицу), Realtime, Google Sheets, `middleware.ts` (кроме фиксации его прямой зависимости от `players.role` — см. ниже).

---

## Inventory таблиц

| Таблица | Repository | Клиент | Read | Write | RLS | Строк |
|---|---|---|---|---|---|---|
| `app_settings` | AppSettings | `supabaseAdmin` (service role) | ✅ | ✅ | **enabled**, 1 policy | 2 |
| `activity_events` | Activity | `supabaseAdmin` (service role) | ✅ | ✅ (insert-only) | **enabled**, 0 policies | 2 603 |
| `seasons` | Season | `supabase` (anon) | ✅ | ✅ | **disabled** | 4 |
| `player_achievements` | Achievement | `supabase` (anon) | ✅ | ✅ | **disabled** | 235 |
| `players` | Player | `supabase` (anon) | ✅ | ✅ | **disabled** | 76 |
| `registrations` | Registration | `supabase` (anon) | ✅ | ✅ | **disabled** | 133 |
| `tournament_live_entries` | TournamentLiveState | `supabase` (anon) | ✅ | ✅ | **disabled** | 34 |
| `results` | Result | `supabase` (anon) | ✅ | ✅ | **disabled** | 126 |
| `tournaments` | Tournament | `supabase` (anon) | ✅ | ✅ | **disabled** | 17 |

Дополнительно: `middleware.ts` читает `players.role` напрямую через `anon`-клиент (не через Repository — сознательное исключение, см. `MIGRATION_PLAN.md`).

---

## Детальный аудит каждой таблицы

Всё ниже — **Confirmed from database**, если не указано иное.

### `players` (76 строк)

| Колонка | Тип | Nullable | Default | Check/Unique |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `telegram_id` | `bigint` | nullable | — | **UNIQUE** (`players_telegram_id_key`) |
| `username` | `text` | nullable | — | |
| `display_name` | `text` | not null | — | |
| `created_at` | `timestamptz` | not null | `now()` | |
| `role` | `text` | not null | `'player'` | **CHECK** `role IN ('player','admin')` |
| `accepted_terms_at` | `timestamptz` | nullable | — | |
| `accepted_terms_version` | `text` | nullable | — | |
| `profile_completed_at` | `timestamptz` | nullable | — | |
| `nickname_status` | `text` | not null | `'approved'` | (не CHECK-constrained на уровне БД, только кодом — единственная "enum-подобная" колонка players без CHECK) |
| `pending_display_name` | `text` | nullable | — | |
| `telegram_avatar_url` | `text` | nullable | — | |
| `custom_avatar_url` | `text` | nullable | — | |
| `avatar_updated_at` | `timestamptz` | nullable | — | |
| `requires_prepayment` | `boolean` | nullable | `false` | **мёртвая колонка** — нет в `PlayerRow`, не используется ни одним Repository-методом; все 76 строк = `false` |
| `no_show_count` | `integer` | nullable | `0` | **мёртвая колонка** — нет в `PlayerRow`; все строки = `0` |
| `last_no_show_at` | `timestamptz` | nullable | — | **мёртвая колонка** — нет в `PlayerRow`; все строки `NULL` |
| `can_access_paid` | `boolean` | not null | `false` | |
| `can_access_cash` | `boolean` | not null | `false` | |
| `can_access_free` | `boolean` | not null | **`true`** | *(в предыдущей код-only версии этого аудита я предполагал `false` — неверно, default действительно `true`)* |
| `admin_display_name` | `text` | nullable | — | комментарий в БД: "Внутренний ник/алиас игрока, видимый только администратору" |
| `email` | `text` | nullable | — | **UNIQUE** функциональный, case-insensitive: `CREATE UNIQUE INDEX players_email_lower_unique ON players (lower(email)) WHERE email IS NOT NULL` — точно совпадает с `normalizeEmail()` (`email.trim().toLowerCase()`) в `features/auth.ts` |
| `is_blocked` | `boolean` | not null | `false` | |
| `blocked_at` | `timestamptz` | nullable | — | |
| `blocked_by` | `uuid` | nullable | — | **FK** на `players.id` (self-referential, `players_blocked_by_fkey`) — существует, 2 строки с непустым значением |
| `block_reason` | `text` | nullable | — | |

**"Хотя бы один идентификатор" CHECK — подтверждено отсутствие.** Нет constraint'а `telegram_id IS NOT NULL OR email IS NOT NULL`. Реальные данные: **9 строк с обоими NULL** (`telegram_id IS NULL AND email IS NULL`) — это не аномалия, а ожидаемые "ручные" игроки, создаваемые `createManualPlayer` (единственный путь создания без обоих идентификаторов).

### `tournaments` (17 строк)

| Колонка | Тип | Nullable | Default | Check |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `title` | `text` | not null | — | |
| `start_at` | `timestamptz` | not null | — | |
| `max_players` | `integer` | not null | — | **CHECK** `max_players > 0` |
| `status` | `text` | not null | — | **CHECK** `status IN ('draft','open','closed','completed')` |
| `created_at` | `timestamptz` | not null | `now()` | |
| `season_id` | `uuid` | nullable | — | **FK** → `seasons.id` (`tournaments_season_id_fkey`) |
| `description` | `text` | nullable | — | |
| `location` | `text` | nullable | — | |
| `google_sheet_tab_name` | `text` | nullable | — | |
| `kind` | `text` | not null | `'free'` | **CHECK** `kind IN ('free','paid','cash')` |

`tournaments_season_id_fkey` — `ON DELETE`/`ON UPDATE` уточнены в разделе Foreign keys.

### `registrations` (133 строки)

| Колонка | Тип | Nullable | Default | Check/Unique |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `player_id` | `uuid` | not null | — | **FK** → `players.id` |
| `tournament_id` | `uuid` | not null | — | **FK** → `tournaments.id` |
| `status` | `text` | not null | — | **CHECK** `status IN ('registered','waitlist','cancelled','attended')` |
| `created_at` | `timestamptz` | not null | `now()` | |

**`UNIQUE(player_id, tournament_id)` подтверждён** (`registrations_player_id_tournament_id_key`). Проверено на совместимость с кодом: `registerPlayerForTournament`-подобные функции в `features/tournaments.ts` (строки 228, 268, 275, 630, 646, 671, 673) всегда сначала ищут существующую запись (`findLatestByPlayerAndTournament`) и **обновляют** её статус (`updateStatus`/`setStatus`), а не создают новую строку, если запись для этой пары уже есть — `create()` вызывается только когда существующей записи нет. Это значит: constraint и код согласованы, но есть небанальное поведенческое следствие — **если игрок отменяет регистрацию и регистрируется заново на тот же турнир, его `created_at` НЕ обновляется** (та же строка), то есть его позиция в FIFO-очереди waitlist при повторной записи определяется исходным, а не новым временем регистрации. Это существующее поведение, не баг — фиксируется здесь как важный нюанс для write-стороны Postgres-реализации (не менять).

### `results` (126 строк)

| Колонка | Тип | Nullable | Default | Check/Unique |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `tournament_id` | `uuid` | not null | — | **FK** → `tournaments.id` |
| `player_id` | `uuid` | not null | — | **FK** → `players.id` |
| `place` | `integer` | not null | — | **CHECK** `place > 0` — на практике всегда задан (в отличие от `ResultInsertInput.place: number \| null` в коде — TS-тип шире, чем реальный constraint; ни одна вставка сегодня не передаёт `null` в `place` для `results`, в отличие от `tournament_live_entries.place`, который **действительно** nullable) |
| `rating_points` | `integer` | not null | — | **CHECK** `rating_points >= 0` |
| `created_at` | `timestamptz` | not null | `now()` | |
| `reentries` | `integer` | not null | `0` | |
| `knockouts` | `integer` | not null | `0` | |
| `season_id` | `uuid` | not null | — | **БЕЗ FK** — денормализация `tournaments.season_id`, подтверждено (0 orphan-значений на практике, но не защищено на уровне БД) |
| `winnings` | `integer` | not null | `0` | |
| `addons` | `integer` | not null | `0` | |
| `spent` | `integer` | not null | `0` | |

**Composite unique подтверждены**: `results_tournament_id_place_key` (`UNIQUE(tournament_id, place)`) и `results_tournament_id_player_id_key` (`UNIQUE(tournament_id, player_id)`) — оба существуют.

**Важное расхождение с типом в коде:** `ResultInsertInput.place: number | null` (допускает `null`), но реальная колонка `results.place` — `NOT NULL` с `CHECK place > 0`. Это значит: код готов к случаю "место не определено", но БД его не допустит — если такой `insert` когда-либо произойдёт с `place: null`, он упадёт с ошибкой constraint, а не тихо запишется. Стоит перепроверить, действительно ли `bulkInsert` когда-либо вызывается с `place: null` в реальном потоке (`features/tournaments.ts`) — если нет, это не риск, а просто более широкий TS-тип, чем нужно.

### `seasons` (4 строки)

| Колонка | Тип | Nullable | Default | Check/Unique |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `title` | `text` | not null | — | |
| `start_date` | `date` | not null | — | |
| `end_date` | `date` | nullable | — | |
| `is_active` | `boolean` | not null | `false` | **UNIQUE партиционный**: `CREATE UNIQUE INDEX one_active_season ON seasons (is_active) WHERE is_active = true` |
| `created_at` | `timestamptz` | not null | `now()` | *(отсутствует в `SeasonRow`/коде — не мёртвая колонка де-факто, просто не читается напрямую нигде, т.к. `list()`/`findActive()` не включают её в бизнес-логику; низкий приоритет, не как три мёртвые колонки `players`)* |

**Важное уточнение к предыдущей версии аудита:** я ошибочно утверждал, что "не более одного активного сезона" — это инвариант, который держит только приложение. Это неверно — партиционный уникальный индекс `one_active_season` гарантирует это на уровне БД уже сегодня. Реальные данные подтверждают: ровно 1 активный сезон из 4 существующих.

### `player_achievements` (235 строк)

| Колонка | Тип | Nullable | Default | Check/Unique |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `player_id` | `uuid` | not null | — | **FK** → `players.id` |
| `achievement_code` | `text` | not null | — | Свободный текст, но реально только 5 значений: `first_tournament`, `first_win`, `pro_1000_rating`, `rookie_100_rating`, `ten_tournaments` — по 47 строк каждое (== 47 игроков имеют полный набор из 5 достижений) |
| `current_value` | `integer` | not null | `0` | **CHECK** `current_value >= 0` |
| `completed_at` | `timestamptz` | nullable | — | |
| `updated_at` | `timestamptz` | not null | `now()` | |

**`UNIQUE(player_id, achievement_code)` подтверждён** (`player_achievements_player_id_achievement_code_key`).

### `tournament_live_entries` (34 строки)

| Колонка | Тип | Nullable | Default | Check/Unique |
|---|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` | PK |
| `tournament_id` | `uuid` | not null | — | **FK** → `tournaments.id` |
| `player_id` | `uuid` | not null | — | **FK** → `players.id` |
| `registration_id` | `uuid` | not null | — | **FK** → `registrations.id`; индексирован (`tournament_live_entries_registration_id_idx`), но **НЕ уникален** — 1:1 с регистрацией держится только приложением, не БД |
| `arrived` | `boolean` | not null | `false` | |
| `rebuys` | `integer` | not null | `0` | |
| `addons` | `integer` | not null | `0` | |
| `knockouts` | `integer` | not null | `0` | |
| `place` | `integer` | nullable | — | (в отличие от `results.place`, здесь действительно nullable — до подведения итогов) |
| `sheet_row_number` | `integer` | nullable | — | |
| `created_at` | `timestamptz` | not null | `now()` | |
| `updated_at` | `timestamptz` | not null | `now()` | |
| `winnings` | `integer` | not null | **`0`** | Подтверждён default — снимает вопрос из предыдущей версии аудита ("не задаётся при `insertMissingEntries`, возможен null") — БД сама подставляет `0` |

**`UNIQUE(tournament_id, player_id)` подтверждён** (`tournament_live_entries_tournament_id_player_id_key`).

### `app_settings` (2 строки)

| Колонка | Тип | Nullable | Default |
|---|---|---|---|
| `key` | `text` | not null | — (PK) |
| `value` | `jsonb` | not null | — |
| `updated_at` | `timestamptz` | not null | `now()` |

RLS **enabled**, одна политика: `"Public read app_settings"` — `PERMISSIVE`, `roles: {public}`, `cmd: SELECT`, `qual: true`, `with_check: null`. Приложение сегодня не использует эту политику (читает и пишет только через `supabaseAdmin`, который обходит RLS) — политика существует, но нефункциональна для текущего кода.

### `activity_events` (2 603 строки)

| Колонка | Тип | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | not null | `gen_random_uuid()` (PK) |
| `player_id` | `uuid` | not null | — (**FK** → `players.id`) |
| `event_type` | `text` | not null | — |
| `event_label` | `text` | nullable | — |
| `metadata` | `jsonb` | nullable | — |
| `platform` | `text` | not null | `'unknown'` |
| `session_id` | `text` | nullable | — |
| `created_at` | `timestamptz` | not null | `now()` |

RLS **enabled**, **0 политик** — де-факто полностью закрыт для `anon`/`authenticated`, что не имеет значения, поскольку приложение обращается только через `supabaseAdmin`.

Реальные значения `event_type` (11 штук, все — осмысленные имена из кода приложения, не мусор от произвольного user input): `app_opened` (731), `page_view_home` (730), `tournament_opened` (439), `email_link_started` (318), `page_view_tournaments` (133), `rating_opened` (105), `profile_opened` (74), `registration_created` (59), `registration_cancelled` (6), `email_link_completed` (5), `support_opened` (2).

---

## Foreign keys

Подтверждено `list_tables` (verbose):

| From | To | Confirmed |
|---|---|---|
| `tournaments.season_id` | `seasons.id` | ✅ (`tournaments_season_id_fkey`) |
| `registrations.player_id` | `players.id` | ✅ (`registrations_player_id_fkey`) |
| `registrations.tournament_id` | `tournaments.id` | ✅ (`registrations_tournament_id_fkey`) |
| `results.tournament_id` | `tournaments.id` | ✅ (`results_tournament_id_fkey`) |
| `results.player_id` | `players.id` | ✅ (`results_player_id_fkey`) |
| `results.season_id` | `seasons.id` | ❌ **не существует** — денормализация без FK, подтверждено |
| `player_achievements.player_id` | `players.id` | ✅ (`player_achievements_player_id_fkey`) |
| `tournament_live_entries.tournament_id` | `tournaments.id` | ✅ (`tournament_live_entries_tournament_id_fkey`) |
| `tournament_live_entries.player_id` | `players.id` | ✅ (`tournament_live_entries_player_id_fkey`) |
| `tournament_live_entries.registration_id` | `registrations.id` | ✅ (`tournament_live_entries_registration_id_fkey`) |
| `players.blocked_by` | `players.id` (self) | ✅ (`players_blocked_by_fkey`) |
| `activity_events.player_id` | `players.id` | ✅ (`activity_events_player_id_fkey`) |

Все FK — `Unverified` только по `ON DELETE`/`ON UPDATE` rule (не запрашивалось отдельно, т.к. код систематически не полагается на каскад — см. ниже; не блокирует проектирование схемы, но стоит уточнить перед написанием Drizzle relations, если каскады должны буквально повторить прод).

**Подтверждено кодом (не изменилось с прошлой версии):** приложение **не полагается на `ON DELETE CASCADE`** ни в одном месте — `features/admin.ts` при удалении игрока явно вызывает `registrationRepository.deleteByPlayerId`, `resultRepository.deleteByPlayerId`, `achievementRepository.deleteByPlayerId`, `tournamentLiveStateRepository.deleteByPlayerId` в правильном порядке перед `playerRepository.deleteById`. Реальные `ON DELETE` правила на этих FK можно уточнить дополнительным запросом, если это станет важно при проектировании Drizzle relations:

```sql
select tc.table_name, kcu.column_name, ccu.table_name as foreign_table_name,
       ccu.column_name as foreign_column_name, rc.delete_rule, rc.update_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name
join information_schema.constraint_column_usage ccu on tc.constraint_name = ccu.constraint_name
join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name
where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public';
```

---

## Индексы

**Подтверждено `pg_indexes` — полный список, 34 индекса.** В отличие от ReRaise (6 дублирующихся пар), у Poker App найден **один** избыточный индекс:

- `idx_players_telegram_id` (обычный btree на `telegram_id`) — полностью покрывается `players_telegram_id_key` (тот же столбец, но `UNIQUE`). Postgres одинаково использует уникальный индекс для точечных `=`-запросов — первый индекс не даёт ничего, чего не давал бы второй, только удваивает стоимость записи. Кандидат на удаление при проектировании новой схемы (не обязательство, а находка).

Все фильтры/сортировки, которые реально выполняют Repository-методы, покрыты индексами:

| Таблица | Индекс | Покрывает |
|---|---|---|
| `players` | `players_telegram_id_key` (unique) | `findByTelegramId`, `middleware.ts` |
| `players` | `players_email_lower_unique` (unique, partial, functional) | `findByEmail` |
| `players` | `players_is_blocked` (partial `WHERE is_blocked = true`) | эффективен для админ-выборок заблокированных |
| `tournaments` | `idx_tournaments_status`, `idx_tournaments_start_at` | `listOpen`, `listCompleted`, сортировки |
| `registrations` | `idx_registrations_player_id`, `idx_registrations_tournament_id`, `idx_registrations_status`, `registrations_player_id_tournament_id_key` (unique) | все методы |
| `results` | `idx_results_player_id`, `idx_results_tournament_id`, обе `UNIQUE`-пары | все методы |
| `seasons` | `one_active_season` (unique partial) | `findActive`, инвариант |
| `player_achievements` | `player_achievements_player_id_idx`, `player_achievements_code_idx`, unique-пара | все методы |
| `tournament_live_entries` | `tournament_live_entries_tournament_id_idx`, `_registration_id_idx`, unique-пара | все методы |
| `activity_events` | `activity_events_created`, `activity_events_player_created`, `activity_events_type_created` | `findPlayerIdsSince`, `countSince`, `findSummarySince` |

Ни один реально используемый Repository-фильтр не оказался без индекса — это хорошая новость для Postgres-схемы: индексная стратегия может быть перенесена практически 1:1, за вычетом одного редундантного индекса на `players.telegram_id`.

---

## RLS и политики

См. врезку "⚠️ Критическая находка" в начале документа — итог: 7 таблиц без RLS, `app_settings` — 1 неиспользуемая политика (SELECT, `qual: true`), `activity_events` — RLS включён, но 0 политик (полностью закрыт для нероль-service запросов). Ни на одной из 9 таблиц нет содержательной (не `true`) RLS-политики, которая бы кодировала скрытую бизнес-логику — то есть **при переходе на Drizzle (который не воспроизводит Supabase RLS вообще) поведение не меняется ни для одной таблицы**, поскольку сегодня оно и так не зависит от RLS.

---

## Triggers и functions

**Подтверждено — пусто.** Оба запроса (`information_schema.triggers`, `information_schema.routines`, схема `public`) вернули пустой результат. Ни одного триггера, ни одной пользовательской функции/процедуры в схеме `public`. Это подтверждает вывод предыдущей код-only версии аудита: `updated_at`/`created_at` обновляются исключительно кодом приложения (`new Date().toISOString()` в каждом write-методе) — переносить в Drizzle-схему нечего, схема полностью пассивна.

Установленные (не просто доступные) расширения в проекте: `pg_stat_statements`, `uuid-ossp`, `pgcrypto`, `supabase_vault`, `plpgsql` (core). Ни `postgis`, ни `pgvector`, ни другие тяжёлые расширения не установлены, несмотря на то что доступны в списке — не будут влиять на self-hosted Postgres-инстанс. `gen_random_uuid()` доступен через `pgcrypto`/ядро — self-hosted Postgres должен иметь тот же источник функции (PG13+ имеет её нативно, более старые версии требуют `pgcrypto`).

`list_migrations` вернул пустой список — схема не отслеживается через Supabase Migration CLI. Это означает, что для Drizzle-схемы нет готовой миграционной истории для сверки — `drizzle-kit generate` будет строить миграции с нуля от текущего снимка схемы, не от цепочки прошлых изменений.

---

## Repository → schema: сопоставление

Без изменений относительно предыдущей версии — таблица методов подтверждена кодом, DB-аудит её не затрагивает:

| Repository | Только своя таблица | JOIN | Возвращает |
|---|---|---|---|
| AppSettings (2) | 2 | 0 | скаляр (`boolean`) |
| Activity (5) | 5 | 0 | domain rows + агрегаты (`count`) |
| Season (9) | 9 | 0 | domain model (`SeasonRow`) |
| Achievement (3) | 3 | 0 | domain model (`PlayerAchievement`) |
| Player (30) | 30 | 0 | domain model (`Player`) + 5 DTO-проекций |
| Registration (18) | 12 | 6 | domain model (`Registration`) + raw JOIN rows |
| TournamentLiveState (5) | 4 | 1 | domain rows (`void`/`string[]`) + raw JOIN rows |
| Result (12) | 9 | 3 | скаляры/агрегаты + raw JOIN rows |
| Tournament (14) | 14 | 0 | domain model (`Tournament`) |

---

## Точные формы JOIN-результатов

Без изменений — подтверждено кодом, не зависит от DB-аудита. Полная детализация (какие поля, какая вложенность) сохранена из предыдущей версии документа:

### `RegistrationRepository` (6 методов)

| Метод | Верхнеуровневые поля | Вложенный `players` |
|---|---|---|
| `findExportParticipants` | `id, status, created_at, player_id` | `id, username, admin_display_name, display_name` |
| `findParticipantsWithRating` | `id, status, created_at, tournament_id, player_id` | `id, username, display_name, telegram_avatar_url, custom_avatar_url` |
| `findResultsDraftParticipants` | `id, status, created_at, tournament_id, player_id` | `id, username, admin_display_name, display_name` |
| `findAdminParticipants` | `id, status, player_id` | `admin_display_name, display_name, telegram_avatar_url, custom_avatar_url` |
| `findLiveEligible` | `id, status, player_id` | `id, username, admin_display_name, display_name` |
| `findNotificationRecipients` | `player_id, status` | `telegram_id, username, display_name` |

### `TournamentLiveStateRepository` (1 метод)

`findWithDetails` — все колонки `tournament_live_entries` (`select("*")`), плюс `registrations.status` и `players.{username, admin_display_name, display_name}`.

### `ResultRepository` (3 метода)

| Метод | Верхнеуровневые поля | Вложенный `players` |
|---|---|---|
| `findByTournamentId` | `player_id, place, knockouts, reentries, rating_points, winnings` | `username, display_name` |
| `findForPlayerStats` | `player_id, place, reentries, addons, knockouts, spent, winnings` | `username, display_name` |
| `findBySeasonId` | `player_id, rating_points` | `username, display_name, telegram_avatar_url, custom_avatar_url` |

Общая закономерность (подтверждена кодом): PostgREST возвращает embedded-связь то объектом, то одноэлементным массивом — Feature везде защищается `Array.isArray(row.X) ? row.X[0] : row.X`, поэтому Drizzle-реализация может вернуть любую из двух форм.

---

## Data quality findings

**Подтверждено реальными данными:**

| Проверка | Результат |
|---|---|
| Строк по таблицам | `players` 76, `seasons` 4, `tournaments` 17, `registrations` 133, `results` 126, `player_achievements` 235, `tournament_live_entries` 34, `app_settings` 2, `activity_events` 2 603 |
| Игроки без телеграм-id и email | **9** — ожидаемо, это "ручные" игроки (`createManualPlayer`) |
| Активных сезонов одновременно | **1** (из 4 существующих) — инвариант выполняется и защищён партиционным unique-индексом |
| `results.season_id` orphan (не ссылается ни на один существующий `seasons.id`) | **0** — данные чистые, несмотря на отсутствие FK |
| `players.blocked_by` заполнено | **2** строки — не мёртвая колонка, реально используется (хоть и не читается через Repository) |
| `players.requires_prepayment = true` | **0** — мёртвая колонка, подтверждено, что фича никогда не активировалась |
| `players.no_show_count > 0` | **0** — то же самое |
| `players.last_no_show_at IS NOT NULL` | **0** — то же самое |
| `tournament_live_entries.winnings IS NULL` | **0** — default `0` работает, TS-тип `winnings: number` (не nullable) корректен |
| Диапазон `telegram_id` | от 4 645 138 до 8 513 262 813 — превышает `int32` (2 147 483 647), подтверждает необходимость `bigint`; безопасно помещается в JS `number` (`Number.MAX_SAFE_INTEGER` = ~9×10¹⁵) — `bigint({ mode: 'number' })` в Drizzle корректен, как и планировалось |
| Различные `event_type` | 11 значений, все осмысленные (см. таблицу `activity_events` выше) — свобода схемы не используется во вред |
| Различные `achievement_code` | ровно 5 ожидаемых значений, по 47 строк каждое |

Дублей email/telegram_id не может быть физически — оба защищены `UNIQUE`-индексами на уровне БД, отдельная проверка не требуется.

---

## Storage dependency

- **Bucket:** `avatars`, **подтверждено публичным** (`public: true` в `storage.buckets`).
- **Path convention:** `{playerId}/avatar` — подтверждено кодом.
- **Доступ:** запись — `supabaseAdmin.storage` (service role, минует любые Storage-политики); URL — `getPublicUrl`, что теперь согласуется с подтверждённым публичным флагом bucket'а (раньше это было лишь предположение по коду).
- **Где хранится URL:** `players.custom_avatar_url` / `players.telegram_avatar_url` — обычные `text`-колонки.
- Перенос Storage — отдельный, более поздний этап (`MIGRATION_PLAN.md` Этап 5), не входит в объём этого шага.

---

## Риски переноса

- **RLS отключён на 7 таблицах** (см. врезку в начале) — существующий риск безопасности прод-Supabase, не создан миграцией, но обязателен к явному решению отдельно от Postgres-перехода.
- **`idx_players_telegram_id` — избыточный индекс** — низкий риск, кандидат на неперенос в новую схему (решение, не автоматическое действие).
- **`results.season_id` без FK** — денормализация, данные сегодня чистые (0 orphan), но ничто не мешает будущей вставке с несуществующим `season_id`, пока constraint не добавлен явно в новой схеме (решение — см. ниже).
- **3 мёртвые колонки в `players`** (`requires_prepayment`, `no_show_count`, `last_no_show_at`) — решение о переносе/отбрасывании нужно принять явно при проектировании схемы, не смешивать с целями этой миграции (это находка, не задача на исправление).
- **`ResultInsertInput.place: number | null` шире, чем реальный `NOT NULL CHECK place > 0`** — стоит перепроверить, действительно ли когда-либо вызывается вставка с `place: null`; если нет — не риск, просто неточный TS-тип.
- **`tournament_live_entries.registration_id` не имеет `UNIQUE`** — 1:1 с регистрацией держится только приложением; при прямой записи в обход Repository (маловероятно, но теоретически возможно при отключённом RLS) можно получить дубли live-записей на одну регистрацию.
- **Отсутствие сохранённой истории миграций Supabase** (`list_migrations` пуст) — Drizzle-схема и её миграции создаются "с нуля" по текущему снимку, без возможности сверить с историей прошлых `ALTER TABLE`.
- **`nickname_status` не защищён CHECK на уровне БД** (единственная enum-подобная колонка `players` без ограничения) — сегодня держится только кодом; кандидат на добавление CHECK при проектировании схемы, как и было предположено ранее.

---

## Решения, которые нужно принять перед Drizzle schema

Список сократился по сравнению с код-only версией — многое из "нужно решить" оказалось уже решено на уровне текущей БД (partial unique index на `seasons`, composite unique на `registrations`/`results`/`tournament_live_entries`, CHECK на большинстве enum-подобных колонок). Осталось:

1. Добавлять ли CHECK "хотя бы один идентификатор" на `players` (`telegram_id IS NOT NULL OR email IS NOT NULL`) — сейчас отсутствует, 9 существующих строк с обоими `NULL` уже это нарушают (значит такой CHECK, если добавить, нужно вводить с осторожностью — существующие "ручные" игроки должны остаться легальными, то есть CHECK должен разрешать этот случай, а не запрещать его).
2. Добавлять ли `CHECK` на `players.nickname_status` (единственная enum-подобная колонка без ограничения на уровне БД).
3. Что делать с денормализацией `results.season_id` без FK — оставить как есть (буквальный перенос) или усилить FK-ограничением в новой схеме.
4. Судьба 3 мёртвых колонок `players` (`requires_prepayment`, `no_show_count`, `last_no_show_at`) — переносить как есть, или сознательно не переносить (с явной фиксацией решения, не молчаливым отбрасыванием).
5. Переносить ли избыточный `idx_players_telegram_id` (дублирует `players_telegram_id_key`) — решение по чистоте схемы, не влияет на поведение.
6. Стоит ли добавить `UNIQUE(registration_id)` на `tournament_live_entries` — сегодня 1:1 держится только приложением.
7. **RLS-стратегия** (см. врезку в начале) — отдельное решение, не связанное напрямую с выбором Postgres/Drizzle, но затрагивающее ту же БД; надо явно решить, входит ли это в объём текущего этапа или полностью откладывается.

---

## Production behavior changed

Нет. Изменений в production-коде не вносилось. В рамках этой сессии дополнительно: переавторизован MCP-сервер Supabase (обновлена переменная окружения `SUPABASE_ACCESS_TOKEN` на верном токене) — это конфигурация инструмента, не часть приложения, не влияет на прод.

## Deviation from agreed plan

Нет отклонений от согласованного плана шага. Первая версия документа была ограничена code-only анализом из-за заблокированного MCP-доступа; после переавторизации в рамках этой же сессии документ обновлён реальными данными — это устраняет, а не создаёт, отклонение от исходного запроса (аудит был явно задуман как read-only проверка реальной БД).

## Git diff

Изменён только `docs/POSTGRES_MIGRATION_AUDIT.md`. Ни один файл продакшен-кода не тронут. Единственное изменение вне git-дерева проекта — переменная окружения `SUPABASE_ACCESS_TOKEN` (Windows User env var, через `setx`), необходимая исключительно для работы MCP-инструмента в этой и будущих сессий; не влияет на само приложение (Next.js читает `SUPABASE_ACCESS_TOKEN` только из `.mcp.json`/окружения MCP-сервера, не из `.env.local` рантайма приложения).

---

## Рекомендованный следующий шаг

MCP-доступ восстановлен, аудит завершён на реальных данных. Следующий шаг по `POSTGRES_MIGRATION_ARCHITECTURE.md` (Migration strategy, шаг 2) — `lib/db/index.ts` и установка Drizzle — но перед этим стоит явно закрыть 7 пунктов из раздела "Решения, которые нужно принять перед Drizzle schema" выше, особенно (1) и (7), поскольку они затрагивают не только форму схемы, но и данные, которые уже нарушают наивный вариант нового constraint'а (9 игроков без идентификаторов), и отдельный вопрос про RLS, который выходит за рамки самой миграции, но требует явного решения — включать его в объём этого этапа или нет.

Остановлено здесь — жду архитектурного ревью обновлённого документа, прежде чем переходить к установке Drizzle.

---

## Обновление: архитектурная блокирующая проблема (не связанная со схемой) обнаружена и решена

После установки Drizzle и появления первой Postgres-реализации репозитория (`PostgresPlayerRepository`) обнаружился отдельный, не относящийся к содержимому этого аудита блокер: `next build` падал из-за того, что `postgres`-драйвер оказывался достижим из графа сборки Client Components. Причина и решение никак не связаны со схемой БД, аудированной в этом документе, — подробности в `docs/POSTGRES_MIGRATION_ARCHITECTURE.md`, раздел «Проблема границы Client Component ↔ Repository Layer», и `docs/ADR-0001-server-actions-boundary.md`. Проблема решена и подтверждена Proof of Concept; находки самого аудита (RLS, мёртвые колонки, денормализация `results.season_id` и т.д., см. выше) остаются актуальными и не затронуты этим решением.
