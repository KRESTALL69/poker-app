# ADR-0001: Server Actions boundary для Feature-модулей, импортируемых Client Components

Статус: **Принято, действует.** Это не историческая запись — правило
`"use server"` на Feature-модулях остаётся в силе и сегодня, независимо от
того, что миграция на Postgres/self-hosted авторизацию, ради которой оно
изначально понадобилось, уже завершена.

> **Примечание (после полного перехода на Postgres).** `DATABASE_PROVIDER`,
> упоминаемый ниже как часть контекста, с тех пор удалён из кодовой базы —
> Supabase-реализаций Repository больше нет, переключать не на что. Само
> решение этого ADR (граница `"use server"`) это не отменяет и не меняет.

Подтверждено Proof of Concept.

Связанные документы: `docs/MIGRATION_PLAN.md` (Этап 1, Этап 3, раздел «Второе отличие от ReRaise, обнаруженное при реализации»), `docs/POSTGRES_MIGRATION_ARCHITECTURE.md` (раздел «Проблема границы Client Component ↔ Repository Layer», раздел «Архитектурные правила»), `docs/POSTGRES_MIGRATION_AUDIT.md` (раздел «Обновление»).

---

## Контекст

Poker App мигрирует хранилище данных с Supabase на self-hosted PostgreSQL (Drizzle), повторяя проверенный в проде путь родственного проекта ReRaise на той же инфраструктуре. К моменту этого решения Repository Layer уже существовал для всех 10 доменов (`interface → Supabase*Repository → index.ts`), и началось добавление вторых, Postgres-реализаций (`Postgres*Repository`) с ветвлением по `DATABASE_PROVIDER`.

При появлении первой такой реализации (`PostgresPlayerRepository`, домен `player`) `next build` стал падать. Диагностика показала, что причина **не в PostgreSQL и не в Drizzle**, а в структуре импортов, существовавшей в проекте ещё до начала Postgres-миграции:

1. 11 `"use client"`-компонентов (`app/page.tsx`, `app/tournaments/page.tsx`, `app/tournaments/[id]/page.tsx`, `app/players/[id]/page.tsx`, `app/players/[id]/achievements/page.tsx`, `app/my-tournaments/page.tsx`, `app/leaderboard/page.tsx`, `app/admin/tournaments/page.tsx`, `app/admin/tournaments/[id]/edit/page.tsx`, `app/admin/tournament-notifications/page.tsx`, `app/admin/results/[id]/page.tsx`) импортируют функции-значения напрямую из `features/auth.ts`, `features/tournaments.ts`, `features/achievements.ts`, минуя `app/api/**`.
2. Эти Feature-модули были обычными TS-модулями без какой-либо границы Client/Server.
3. Каждый доменный `lib/repositories/<domain>/index.ts` делает eager static import обеих реализаций разом (`Supabase*Repository` и `Postgres*Repository`), ветвясь по `databaseProvider` только в рантайме — то есть сам факт существования файла `Postgres*Repository.ts` в дереве импортов уже втягивает его в граф сборки, вне зависимости от значения флага.
4. Postgres-репозитории используют пакет `postgres` (`drizzle-orm/postgres-js`), зависящий от Node core-модулей `net`/`tls`, недоступных в браузерном окружении.

Итог: у Next.js не было ни одного сигнала о том, что `features/tournaments.ts` (и всё, что за ним) должно остаться на сервере. Весь граф `"use client"`-страница → Feature → Repository → `postgres` включался в клиентский бандл, и сборщик падал на резолве `net`/`tls`.

## Рассмотренные варианты

### 1. `import "server-only"` в каждом `Postgres*Repository.ts`

Уже было и осталось в проекте как вторая линия защиты, но само по себе проблему не решает: `server-only` — runtime/сборочная проверка постфактум, она громко называет нарушивший файл, но не *убирает* его из клиентского графа. Граф всё равно строится и падает — просто с более понятной ошибкой.

### 2. `package.json#browser` + `index.browser.ts`/`index.server.ts` (POC на домене `player`)

Per-домену `package.json` с полем `"browser"`, указывающим на browser-safe `index.browser.ts` (только `Supabase*Repository`) вместо `"main"` (`index.server.ts`, обе реализации). Результат: настоящий browser-бандл действительно переставал резолвить `postgres`. Но App Router отдельно строит граф **Client Component SSR** (рендеринг клиентских компонентов на сервере) — этот граф резолвит `"main"`, не `"browser"`, и продолжает утыкаться в `index.server.ts` → `postgres`. `next build` продолжал падать.

Отклонено: не решает проблему полностью; и даже если бы решало — потребовало бы ручного тиражирования per-домену `package.json`-трюка на все 10 доменов, что является обходным путём, а не архитектурным решением.

### 3. Анализ архитектуры ReRaise

ReRaise — родственный проект на той же инфраструктуре, уже прошедший тот же переход Supabase → Postgres/Drizzle. Изучение его кода (не только документации) показало: `features/tournaments.ts` и `features/auth.ts` в ReRaise начинаются с директивы `"use server"`. `features/achievements.ts`/`features/admin.ts` этой директивы не несут — потому что ни один Client Component ReRaise их напрямую не импортирует (проверено, а не предположено).

`"use server"` — компиляторная граница React Server Components (Next.js Server Actions), а не runtime-guard: тела экспортированных функций (и весь хвост их импортов) вырезаются из клиентского графа ещё до попытки сборщика резолвить модули. Клиентский компонент получает лёгкую RPC-ссылку, а не код репозитория.

### 4. PoC переноса подхода ReRaise в Poker App

Выполнено: `"use server"` добавлена в `features/auth.ts`, `features/tournaments.ts`, `features/achievements.ts`; POC с `browser`-полем/`index.browser.ts`/`index.server.ts` полностью откачен, `player`-домен приведён к тому же виду, что и остальные 9 доменов (обычный `index.ts` с `databaseProvider`). Единственное найденное препятствие — константа `TERMS_VERSION`, экспортировавшаяся из `features/auth.ts` вперемешку с async-функциями (файл с `"use server"` может экспортировать только async-функции и `export type`) — устранено переносом константы в `lib/terms.ts`, по образцу того же решения в ReRaise.

Результат подтверждён практически (см. «Последствия» ниже).

## Решение

**Feature-модули, которые напрямую импортируются из Client Components, должны начинаться с директивы `"use server"`.**

Применено к `features/auth.ts`, `features/tournaments.ts`, `features/achievements.ts` — файлам, для которых по факту (не по предположению) подтверждён прямой импорт из `"use client"`-компонента. Не применено к `features/admin.ts`, `features/settings.ts` — ни один Client Component их не импортирует.

Файл с `"use server"` может экспортировать только async-функции и `export type`. Любые прочие значения (константы и т.п.), нужные и Feature-модулю, и клиентскому коду, выносятся в отдельный модуль без этой директивы.

Repository Layer при этом не меняется: composition root `databaseProvider` (`lib/repositories/provider.ts`) остаётся единственной точкой ветвления по `DATABASE_PROVIDER`, `server-only` в каждом `Postgres*Repository.ts` остаётся как defense-in-depth (на случай появления в будущем четвёртого пути импорта в обход `"use server"`-границы), но не как основной механизм разделения client/server — им является `"use server"` в Feature-слое.

## Последствия

Проверено практическим экспериментом:

- `tsc --noEmit` — чисто (кроме предсуществующего, не связанного с этой задачей пробела в типах одного vitest-теста).
- `next build` при `DATABASE_PROVIDER` не заданном (supabase, по умолчанию) — успешно.
- `next build` при `DATABASE_PROVIDER=postgres` — успешно, без деградации скорости сборки.
- Поиск по `.next/static` (клиентский бандл) на `postgres-js`, `PostgresError`, `drizzle-orm`, `node:net`, `node:tls` — ни одного совпадения в обеих сборках; те же строки присутствуют в `.next/server/**` — граница реально разделяет графы.
- `npx vitest run` — 22/22 теста, 5/5 файлов, без изменений в результатах.

Положительные следствия:
- Postgres-миграция может продолжаться без переписывания UI, без изменения Repository Interface, без новых архитектурных решений сверх уже проверенных в ReRaise.
- Правило масштабируется на оставшиеся 9 доменов без дополнительного проектирования — оно применяется к Feature-модулю целиком, а не per-домену.

Компромиссы, принятые сознательно:
- Каждый вызов Server Action из Client Component становится сетевым RPC-запросом (а не прямым вызовом функции), когда вызывается из браузера — стандартное поведение Next.js Server Actions, не специфичное для этого решения.
- Аргументы и возвращаемые значения функций, ставших Server Actions, должны быть сериализуемы протоколом React (примитивы, plain-объекты/массивы, `Date`, `Map`, `Set` — поддерживаются; функции, class-инстансы, `Symbol` — нет). На момент принятия решения ни один экспорт `features/auth.ts`/`features/tournaments.ts`/`features/achievements.ts` этому не противоречит (проверено).

## Альтернативы, отклонённые окончательно

- Держать `Postgres*Repository` недостижимыми только через `server-only` — не устраняет падение сборки, только делает ошибку понятнее.
- `package.json#browser` / `index.browser.ts` / `index.server.ts` как постоянный архитектурный паттерн — не решает Client Component SSR граф, требует ручного тиражирования на все домены.
- Переписать все Client Components на вызовы через `app/api/**` (полный отказ от прямого импорта Feature) — не рассматривалось как основное решение: потребовало бы правки всех 11 клиентских файлов и по сути отказа от уже существующего в проекте паттерна (тот же паттерн у ReRaise, где он работает через Server Actions, а не через API routes).
