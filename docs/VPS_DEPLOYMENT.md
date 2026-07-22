# Poker App: развёртывание на VPS через Docker

Статус: **актуально, описывает текущее production-состояние.** Приложение
живёт на `https://www.dontworryclub.pro`, за nginx с TLS (Let's Encrypt),
PostgreSQL и авторизация полностью self-hosted (Supabase не используется).

---

## Инфраструктура VPS

Ветка `main` — единственная production-ветка. Каждый push в неё автоматически
собирает и разворачивает новую версию через GitHub Actions (`.github/workflows/deploy.yml`)
— см. раздел «Автоматический деплой (CI/CD)» ниже. Ручной путь (`scripts/deploy.sh`
или команды вручную) остаётся рабочим fallback-ом на случай недоступности CI.

Один VPS хостит три независимых проекта в отдельных Docker-контейнерах:

| Контейнер | Порт | Владелец |
|---|---|---|
| `poker-app` | `127.0.0.1:3003→3000` (за nginx) | Poker App |
| `re-raise` | `127.0.0.1:3002→3000` (за nginx) | ReRaise |
| `poker-clock` | `0.0.0.0:3001→3000` | Poker Clock |
| `poker-clock-db` | `127.0.0.1:5432→5432` | общая инфраструктура, ничья |

Сети: `poker-clock_default` (общая для `poker-app`, `poker-clock-db`, `re-raise`).

**Poker App переиспользует общий контейнер `poker-clock-db`** — отдельного
`poker-postgres`-сервиса нет. Внутри создана отдельная база `poker_app` и
отдельный пользователь `poker_app` — полная изоляция данных на уровне СУБД
от базы Poker Clock, без отдельного контейнера.

nginx (на хосте, вне Docker) терминирует TLS и проксирует на
`127.0.0.1:3003`. Конфигурация — `/etc/nginx/sites-available/dontworryclub.pro`
на VPS, референсная копия — `deploy/nginx/dontworryclub.pro.conf` в репозитории.

---

## Структура на VPS

```
/opt/poker-app/
├── compose.yaml
├── .env                  (chmod 600, не в git)
├── storage/               (bind mount — локальные аватары, см. ниже)
├── app/ ...               (клон репозитория — сам compose.yaml лежит в корне клона)
└── backups/               (создаётся scripts/backup-postgres.sh)
```

`/opt/poker-app` — сам клон git-репозитория; `compose.yaml` собирает образ
из этого же контекста.

---

## Docker-образ

`Dockerfile` — 4 стадии:

1. **`deps`** — `npm ci`.
2. **`builder`** — `npm run build`. Требует build-arg `NEXT_PUBLIC_APP_URL`
   (используется для абсолютных URL — аватарки, письма).
3. **`migrator`** — наследует `deps`, не `builder`: нужен только
   `node_modules` + исходники (`drizzle.config.ts`, `lib/db/`), компилировать
   Next.js не требуется. Собирается только явным `--target migrator` /
   `docker compose build migrate`, никогда не входит в обычный `docker build`.
4. **`runner`** — non-root (`nextjs:1001`), standalone-output Next.js,
   `EXPOSE 3000`. При старте создаётся `public/storage/avatars` с owner'ом
   `nextjs:nodejs` для локального хранения аватарок.

`next.config.ts` использует `output: "standalone"` и `outputFileTracingRoot`.

`GET /api/health` (`app/api/health/route.ts`, `{ ok: true }`) — используется
Docker healthcheck.

---

## `compose.yaml`

Сервис `app` (`container_name: poker-app`), плюс `migrate` под Compose-
профилем `migrate` (не поднимается по умолчанию):

- `restart: unless-stopped`.
- `ports: 127.0.0.1:3003:3000` — loopback-only, публичный доступ идёт через
  nginx (TLS-терминация + reverse proxy), не напрямую.
- `volumes: ./storage:/app/public/storage` — bind mount для локальных
  аватарок (`LocalAvatarStorageRepository`); nginx также отдаёт `/storage/*`
  напрямую с этого же хостового пути, минуя Node.
- `healthcheck` — `wget --spider http://127.0.0.1:3000/api/health`.
- `networks.default` — внешняя `poker-clock_default` (та же сеть, где сидит
  `poker-clock-db`, `re-raise`).
- `DATABASE_URL` резолвит `poker-clock-db` по Docker DNS-имени внутри этой
  сети — не через `127.0.0.1:5432` хоста.
- `.env` не копируется в образ (`.dockerignore` его исключает); секреты
  приходят только через переменные окружения `docker compose`.

---

## Миграции

- `drizzle.config.ts`, `lib/db/schema.ts`, `lib/db/migrations/*.sql` —
  versioned-миграции, применяются не через `drizzle-kit migrate` CLI (у него
  известный баг — молчаливое проглатывание ошибок), а через
  `scripts/migrate.mjs` (`drizzle-orm/postgres-js/migrator` напрямую,
  `npm run db:migrate`).
- В проде — отдельный, одноразовый прогон: `docker compose run --rm migrate`,
  не автоматически при каждом `docker compose up`.
- Новая миграция схемы: `npx drizzle-kit generate` локально, закоммитить
  сгенерированный `.sql`, на VPS — `docker compose build migrate && docker
  compose run --rm migrate`.

---

## Хранение аватарок

`LocalAvatarStorageRepository` пишет в `public/storage/avatars/{playerId}/avatar.{ext}`
внутри контейнера, что через bind mount оказывается в `/opt/poker-app/storage/`
на хосте. nginx отдаёт этот путь напрямую (`location ^~ /storage/` →
`alias /opt/poker-app/storage/`), без обращения к Node. Supabase Storage не
используется — см. `docs/POSTGRES_MIGRATION_AUDIT.md` (архив) для истории
переноса.

---

## Автоматический деплой (CI/CD)

Реализовано по образцу ReRaise (`.github/workflows/deploy.yml` в `reraise-miniapp`),
адаптировано под структуру Poker App. Workflow: `.github/workflows/deploy.yml`.

**Когда запускается:** на каждый push в `main`.

**Job `checks`** (обычный GitHub-раннер, без доступа к VPS/секретам приложения):

1. `npm ci`
2. `npx tsc --noEmit` — typecheck
3. `npm run lint`
4. `npm test` — `vitest run`
5. `npm run build` — санитарная сборка Next.js на раннере, с
   `NEXT_PUBLIC_APP_URL` = production-домен как plain env (не секрет — это
   публичный URL). Не использует `DATABASE_URL` и другие секреты: `lib/db/index.ts`
   резолвит подключение к Postgres лениво, только при первом реальном
   обращении, поэтому `next build` не падает без переменных окружения VPS.
   Эта сборка отдельна от реальной production-сборки образа на VPS — она
   существует только чтобы поймать typecheck/build-ошибки до SSH-шага.

Если любой из шагов падает — job `deploy` не запускается вообще (`needs: checks`).

**Job `deploy`** (только для `main`, только если `checks` прошли; `concurrency:
production-deploy`, `cancel-in-progress: false` — деплой никогда не прерывается
на середине, следующий push просто встаёт в очередь после текущего):

1. SSH на VPS по ключу из `secrets.VPS_SSH_KEY`.
2. `cd /opt/poker-app`, `git fetch && git checkout main && git pull --ff-only`.
3. Сверка SHA: если `git rev-parse HEAD` на VPS не совпадает с коммитом,
   для которого запущен workflow — деплой прерывается (`exit 1`), а не
   разворачивает случайно другой коммит.
4. `docker compose build app` — сборка production-образа (здесь и происходит
   настоящий `next build`, уже с реальным `/opt/poker-app/.env`).
5. `docker compose build migrate && docker compose run --rm migrate` —
   применение миграций схемы. Идемпотентно: `scripts/migrate.mjs`
   (`drizzle-orm/postgres-js/migrator`) хранит журнал применённых миграций и
   просто ничего не делает, если новых `.sql`-файлов нет.
6. `docker compose up -d --no-deps app` — пересоздаётся только контейнер
   `app`; `poker-clock-db`, `re-raise`, `poker-clock`, сеть, volumes и
   bind mount аватарок не затрагиваются ни одной командой.
7. Проверка, что запущенный контейнер реально работает на только что
   собранном image ID (а не на старом — на случай отсутствия эффекта от `up`).
8. Поллинг `docker inspect` до `running` + `healthy` (таймаут 120с). Если
   контейнер падает или сообщает `unhealthy` — job красный, в лог попадают
   последние 200 строк `docker compose logs`.
9. Smoke-test: `GET /api/health` (ожидается ровно `{"ok":true}`) и `GET /`
   на `https://www.dontworryclub.pro`.
10. Только после успеха всех шагов — `docker image prune -f` (удаляет только
    dangling-образы, ничего тегированного/используемого).

Если что-то из этого не проходит — деплой завершается с ошибкой, старый
контейнер `app` продолжает работать (шаг 6 создаёт новый контейнер, но
`docker compose up` не удаляет предыдущий образ, и до успешного healthcheck/
smoke-теста мы не считаем деплой завершённым; см. «Откат» ниже, если сам
запущенный контейнер оказался нерабочим).

### Требуемые GitHub Secrets

Настраиваются в repo Settings → Secrets and variables → Actions:

| Secret | Назначение |
|---|---|
| `VPS_SSH_KEY` | Приватный SSH-ключ для входа на VPS (deploy-ключ, доступ только к нужному пользователю) |
| `VPS_HOST` | Хост/IP VPS |
| `VPS_USER` | Пользователь SSH на VPS (от его имени выполняется `git pull`/`docker compose`) |
| `VPS_SSH_PORT` | (опционально) нестандартный SSH-порт; по умолчанию `22`, если secret не задан |

Ничего не хранится в репозитории — `.env` на VPS, как и раньше, создаётся
вручную (`docs/VPS_DEPLOYMENT.md`, раздел «Первое развёртывание») и в git не
попадает.

### Ручной деплой (fallback)

Если CI недоступен или нужно продеплоить руками — команды из раздела
«Команды» ниже или `./scripts/deploy.sh` по-прежнему работают без изменений;
CI выполняет ровно те же шаги, просто автоматически на каждый push.

### Откат к предыдущей версии

```bash
cd /opt/poker-app
git log --oneline -5              # найти <previous-sha>
git checkout <previous-sha>
docker compose build app
docker compose up -d --no-deps app
docker compose ps                 # убедиться, что снова running/healthy
```

БД не трогается — миграции откатом кода не отменяются (Drizzle-миграции
считаются forward-only; для отката схемы нужна отдельная ручная
`down`-миграция, если она вообще нужна). После отката вернуть `main` на
нужный коммит (`git push --force` с осторожностью, либо `git revert` —
предпочтительно) и продолжить работу через обычный CI-деплой, иначе
следующий push в `main` снова накатит откаченный код.

---

## Команды

**Первое развёртывание (на VPS, из `/opt/poker-app`):**
```bash
git clone https://github.com/KRESTALL69/poker-app.git .
cp .env.example .env && chmod 600 .env && nano .env   # заполнить реальные значения
mkdir -p storage/avatars
docker compose config          # проверить, что интерполяция env прошла
docker compose build app
docker compose run --rm migrate   # применяет схему к БД poker_app
docker compose up -d app
docker compose ps
docker compose logs --tail=200 app
```

**Обычный деплой обновлений:**
```bash
git pull --ff-only origin main
docker compose build app
docker compose run --rm migrate   # только если есть новые миграции схемы
docker compose up -d --no-deps --force-recreate app
```

Или через `./scripts/deploy.sh` (git pull --ff-only, build, recreate только
`app`, поллинг healthy, smoke-test, prune dangling images; ReRaise/Poker
Clock не затрагиваются ни одной командой).

**Откат:** `git checkout <previous-sha> && docker compose build app &&
docker compose up -d --no-deps app` — образ пересобирается из известного
хорошего коммита, БД не трогается (миграции применяются отдельным шагом).

**Логи:** `docker compose logs --tail=200 -f app`.

**Backup БД:** `POSTGRES_APP_USER=poker_app POSTGRES_APP_DB=poker_app
PGPASSWORD=<пароль роли poker_app> ./scripts/backup-postgres.sh` — дамп
только базы `poker_app` из общего контейнера, хранит последние 14.

**nginx:** конфиг — `/etc/nginx/sites-available/dontworryclub.pro`,
проверка синтаксиса — `sudo nginx -t`, применение — `sudo systemctl reload
nginx` (не restart). TLS выпущен через `certbot --nginx`, автопродление —
штатный systemd-таймер certbot, проверяется через `certbot renew --dry-run`.

---

## Переменные окружения

См. `.env.example` — там же короткое описание каждой переменной. Полное
объяснение того, откуда взялись `RESEND_API_KEY`/`EMAIL_FROM`/`SESSION_SECRET`
и как устроена авторизация — `docs/AUTH_MIGRATION.md`.

---

## История

Этот документ описывал изначальный план первого безопасного развёртывания
(`docs/MIGRATION_PLAN.md`, Этапы 6–7). План выполнен полностью: backfill
данных, переключение на PostgreSQL, перенос Storage, домен/DNS/TLS,
Telegram webhook — всё уже в проде. Исторические подробности самого
перехода — `docs/MIGRATION_PLAN.md`, `docs/POSTGRES_MIGRATION_ARCHITECTURE.md`,
`docs/POSTGRES_MIGRATION_AUDIT.md`, `docs/BACKFILL_RUNBOOK.md` (архив, не
инструкции к действию).
