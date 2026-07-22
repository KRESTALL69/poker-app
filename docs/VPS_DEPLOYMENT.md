# Poker App: развёртывание на VPS через Docker

Статус: **черновик, первое безопасное развёртывание ещё не выполнено**. Этот документ описывает Этапы 6–7 `docs/MIGRATION_PLAN.md` (Docker, CI/CD) применительно к реальному VPS, где уже работает ReRaise и Poker Clock.

---

## Существующая инфраструктура VPS (аудит, не изменялась)

VPS уже хостит:

| Контейнер | Образ | Порт | Владелец |
|---|---|---|---|
| `poker-clock` | свой | `0.0.0.0:3001→3000` | Poker Clock |
| `re-raise` | `re-raise:latest` | `127.0.0.1:3002→3000` | ReRaise |
| `poker-clock-db` | `postgres:16-alpine` | `127.0.0.1:5432→5432` | общая инфраструктура (`/opt/postgres`, ничья) |

Сети: `poker-clock_default`, `reraise_default`. Volume: `poker-clock_postgres_data` (единственный).

`/opt/postgres/docker-compose.yml` явно документирует себя как инфраструктуру, не принадлежащую ни одному приложению — тот же принцип, что и общий nginx на хосте.

---

## Архитектурное решение: PostgreSQL

**Poker App переиспользует существующий контейнер `poker-clock-db`, отдельного `poker-postgres`-сервиса не создаётся.**

Причины:
- Так зафиксировано в `docs/MIGRATION_PLAN.md`, Этап 2, п.3 — решение принято до этого этапа, не заново.
- VPS ограничен по памяти (3.8GB, из них ~2.8GB реально доступно) — второй Postgres-инстанс стоил бы заметную часть бюджета ради того, что уже есть.
- Внутри `poker-clock-db` создаётся отдельная база `poker_app` и отдельный пользователь `poker_app` — полная изоляция данных на уровне СУБД от базы Poker Clock, без изоляции на уровне процесса/контейнера.

---

## Структура на VPS

```
/opt/poker-app/
├── compose.yaml
├── .env                  (chmod 600, не в git)
├── app/ ...               (клон репозитория — сам compose.yaml лежит в корне клона)
└── backups/               (создаётся scripts/backup-postgres.sh)
```

На практике (как и у `/opt/reraise`) `/opt/poker-app` — это сам клон git-репозитория; `compose.yaml` собирает образ из этого же контекста.

---

## Docker-образ

`Dockerfile` — 4 стадии, скопировано с проверенного шаблона ReRaise (`/opt/reraise/Dockerfile`), адаптировано:

1. **`deps`** — `npm ci`.
2. **`builder`** — `npm run build`. Требует build-arg `NEXT_PUBLIC_APP_URL` (используется для абсолютных URL аватарок). Supabase-специфичные build-args (`NEXT_PUBLIC_SUPABASE_URL` и т.д.) удалены вместе с Supabase Auth — см. `docs/AUTH_MIGRATION.md`.
3. **`migrator`** — наследует `deps`, не `builder` (тот же принцип, что у ReRaise): нужен только `node_modules` + исходники (`drizzle.config.ts`, `lib/db/`), компилировать Next.js не требуется. Собирается только явным `--target migrator` / `docker compose build migrate`, никогда не входит в обычный `docker build`.
4. **`runner`** — non-root (`nextjs:1001`), standalone-output Next.js, `EXPOSE 3000`.

`next.config.ts` дополнен `output: "standalone"` и `outputFileTracingRoot` (тот же фикс, что у ReRaise — без него локальный `npm run build` на Windows подхватывал посторонний lockfile из `C:\Users\KRESTALL\package-lock.json` как workspace root).

Добавлен `GET /api/health` (`app/api/health/route.ts`, тривиальный `{ ok: true }`) — раньше отсутствовал, нужен для healthcheck.

---

## `compose.yaml`

Один сервис `app` (`container_name: poker-app`), плюс `migrate` под Compose-профилем `migrate` (не поднимается по умолчанию):

- `restart: unless-stopped`.
- `ports: 127.0.0.1:3003:3000` — **только loopback**. Нет ни nginx-сайта, ни DNS, ни TLS для Poker App пока — это отдельный, более поздний шаг. Проверка снаружи — через SSH-туннель (`ssh -L 3003:127.0.0.1:3003 poker-clock-vps`), не через публичный порт.
- `healthcheck` — `wget --spider http://127.0.0.1:3000/api/health`.
- `networks.default` — внешняя `poker-clock_default` (та же сеть, где сидит `poker-clock-db`, `re-raise`) — не создаём новую сеть.
- `DATABASE_URL` резолвит `poker-clock-db` по Docker DNS-имени внутри этой сети — не через `127.0.0.1:5432` хоста.
- `.env` не копируется в образ (`.dockerignore` его исключает); секреты приходят только через переменные окружения самого `docker compose` (интерполяция `${VAR}` из `.env` на хосте).

---

## Миграционный pipeline

- `drizzle.config.ts`, `lib/db/schema.ts`, `lib/db/migrations/0000_opposite_bucky.sql` — уже существуют и уже закоммичены (см. коммит «Миграция 1»), реальная versioned-миграция, не `drizzle-kit push`.
- Применение — **не штатный `drizzle-kit migrate` CLI** (документированный баг проглатывания ошибок, унаследованный от находки ReRaise), а `scripts/migrate.mjs`, вызывающий `drizzle-orm/postgres-js/migrator` напрямую. Добавлен npm-скрипт `db:migrate`.
- В проде — отдельный, одноразовый прогон: `docker compose run --rm migrate`, не автоматически при каждом `docker compose up`. Миграции применяются **только к новой БД `poker_app`**, никогда к БД Poker Clock внутри того же контейнера.

---

## Что осталось перед переносом данных

Из `docs/MIGRATION_PLAN.md`, Этап 2–4 — не входит в объём этого документа:

- Backfill реальных данных из Supabase.
- Validation после backfill (паритет по количеству строк, выборочные проверки).
- Проверка паритета Supabase ⇄ Postgres на реальных данных (Этап 3 чек-лист).
- Осознанное решение о переключении `DATABASE_PROVIDER=postgres` в проде (Этап 4) — не автоматическое следствие того, что контейнер поднят.
- Домен/DNS/TLS/reverse proxy для Poker App — отдельный, более поздний шаг (Этап 9), сейчас доступ только через loopback + SSH-туннель.
- Перенос Storage (аватары) — Этап 5, отдельно, Supabase Storage пока используется как есть.

---

## Команды

**Первое развёртывание (на VPS, из `/opt/poker-app`):**
```bash
git clone https://github.com/KRESTALL69/poker-app.git .
cp .env.example .env && chmod 600 .env && nano .env   # заполнить реальные значения
docker compose config          # проверить, что интерполяция env прошла
docker compose build app
docker compose run --rm migrate   # применяет схему к пустой БД poker_app
docker compose up -d app
docker compose ps
docker compose logs --tail=200 app
```

**Деплой обновлений:** `./scripts/deploy.sh` (см. файл — git pull --ff-only, build, recreate только `app`, поллинг healthy, smoke-test, prune dangling images; ReRaise/Poker Clock не затрагиваются ни одной командой).

**Откат:** `git checkout <previous-sha> && docker compose build app && docker compose up -d --no-deps app` — тот же принцип, что у ReRaise (образ пересобирается из известного хорошего коммита, БД не трогается, т.к. миграции применяются отдельным шагом, не при каждом деплое).

**Логи:** `docker compose logs --tail=200 -f app` (там же, где и раньше — штатный `json-file`-драйвер Docker, отдельной агрегации логов на VPS нет ни у одного из существующих проектов).

**Backup БД:** `POSTGRES_APP_USER=poker_app POSTGRES_APP_DB=poker_app PGPASSWORD=<пароль роли poker_app> ./scripts/backup-postgres.sh` — дамп только базы `poker_app` из общего контейнера, хранит последние 14. `PGPASSWORD` обязателен — без него `pg_dump` неинтерактивно зависнет на запросе пароля. У ReRaise аналогичного скрипта нет (проверено аудитом) — это новый процесс, не копия существующего.
