# Don't Worry Club (Poker App)

Telegram Mini App + web-приложение для покерного клуба: турниры, waitlist,
рейтинг, достижения, админка, support-бот. Работает как Telegram Mini App
(внутри Telegram) и как обычный web-сайт (`https://www.dontworryclub.pro`) —
оба режима используют одну и ту же бизнес-логику через общую сущность `player`.

Полностью self-hosted: собственный VPS, PostgreSQL, локальное файловое
хранилище, собственная OTP-авторизация. **Supabase и Vercel больше не
используются нигде в проекте** — см. `docs/AUTH_MIGRATION.md` о переходе с
Supabase Auth и `docs/POSTGRES_MIGRATION_ARCHITECTURE.md` о переходе с
Supabase Database (оба документа помечены как архивные записи о завершённой
миграции, не как текущие инструкции).

---

## Стек технологий

- **Next.js 16** (App Router) + React 19 + TypeScript
- **Tailwind CSS 4**
- **PostgreSQL** (self-hosted, на VPS) + **Drizzle ORM**
- **Telegram Bot API** + Telegram Mini App SDK
- **Resend** — отправка email (OTP-коды)
- **Google Sheets API** — экспорт/импорт результатов турниров
- **Docker** + **nginx** — деплой на VPS
- **Vitest** — тесты

---

## Архитектура

```
┌─────────────────────┐     ┌──────────────────────┐
│  Telegram Mini App   │     │   Web App (браузер)   │
│  (внутри Telegram)    │     │  dontworryclub.pro    │
└──────────┬───────────┘     └──────────┬───────────┘
           │ x-telegram-init-data          │ dwc_tg_session cookie
           │ (заголовок)                    │ (email OTP или
           │                                 │  Telegram OAuth widget)
           └───────────────┬─────────────────┘
                            ▼
                  Next.js App Router
              (Server Components, Server Actions,
                     API routes, middleware)
                            │
                            ▼
                     Feature Layer
                (features/*.ts — бизнес-логика:
              турниры, waitlist, рейтинг, достижения)
                            │
                            ▼
                    Repository Layer
        (lib/repositories/<domain>/{Interface,
              Postgres<Domain>Repository, index}.ts)
                            │
                            ▼
                  PostgreSQL (Drizzle ORM)
             self-hosted, общий VPS-контейнер
```

Оба входа (Telegram Mini App и Web App) приводятся к одному и тому же
внутреннему `player` — вся бизнес-логика (турниры, waitlist, рейтинг,
достижения) работает через `player.id`, не завязана на обязательное наличие
`telegram_id` или `email`.

### Авторизация

Три независимых способа получить `player`, сходящихся к одному и тому же
Repository Layer:

1. **Telegram Mini App** — приложение получает `initData` из Telegram WebApp
   SDK, сервер проверяет HMAC-подпись (`lib/telegram-init-data.ts`,
   `TELEGRAM_BOT_TOKEN`), находит/создаёт `player` по `telegram_id`.
2. **Email OTP** (страница `/login`) — собственная система одноразовых
   кодов, без Supabase Auth. См. «OTP» ниже.
3. **Telegram OAuth widget** (`/api/auth/telegram` → `/api/auth/telegram/callback`) —
   вход через Telegram Login Widget для веба, тот же принцип верификации
   подписи, что и у Mini App, но по схеме Telegram Login Widget (HMAC от
   `sha256(botToken)`, не от `"WebAppData"`).

Оба веб-сценария (email OTP и Telegram OAuth widget) заканчиваются одной и
той же подписанной cookie `dwc_tg_session` — единый механизм сессии для
всего, что не является Mini App.

### OTP (собственная система, архитектура ReRaise)

- Таблица `email_otp_codes` (Postgres): `email`, `purpose` (`login` |
  `link_email`), хеш кода (`sha256(email:purpose:code:SESSION_SECRET)`,
  сравнение через `timingSafeEqual`), `expires_at`, `resend_after_at`,
  `failed_attempts`, `consumed_at`.
- 6-значный код, TTL 10 минут, resend cooldown 60 секунд, максимум 5 попыток
  ввода, одноразовость через `consumed_at`.
- Отправка — Resend (`lib/resend.ts`, `RESEND_API_KEY`, `EMAIL_FROM`).
- Бизнес-логика — `lib/email-otp.ts`; доступ к данным — `lib/repositories/email-otp/`.
- Роуты: `POST /api/auth/email/request-code`, `POST /api/auth/email/verify-code`,
  `POST /api/auth/logout`.
- `purpose: "link_email"` — сценарий внутри Mini App (привязка email к уже
  известному Telegram-игроку); личность подтверждается через
  `x-telegram-init-data`, так как в Mini App нет cookie-сессии.

Подробнее — `docs/AUTH_MIGRATION.md`.

### Сессии

Подписанная HMAC-SHA256 cookie `dwc_tg_session` (`lib/telegram-web-session.ts`):
`"<playerId>.<hmac>"`, `httpOnly`, `secure` в проде, `sameSite: lax`, 30 дней.
Никакой серверной таблицы сессий — cookie сама себе сессия. `POST
/api/auth/logout` очищает cookie на клиенте; серверной инвалидации токена нет
(нечего инвалидировать — состояние не хранится на сервере).

`middleware.ts` защищает `/api/admin/*`: резолвит вызывающего либо по
`x-telegram-init-data` (Mini App), либо по cookie (веб), затем один вызов
`playerRepository` проверяет `role === "admin"`. Работает в
`runtime: "nodejs"` — Postgres-соединению нужны настоящие TCP-сокеты,
недоступные в Edge runtime по умолчанию.

### Repository Layer

Каждый домен (`player`, `tournament`, `registration`, `result`, `season`,
`achievement`, `activity`, `app-settings`, `tournament-live-state`,
`avatar-storage`, `email-otp`) — три файла в `lib/repositories/<domain>/`:

- `Interface.ts` — контракт домена.
- `Postgres<Domain>Repository.ts` — единственная реализация (Supabase-реализаций
  больше не существует — удалены вместе с полным переходом на Postgres).
- `index.ts` — простая инстанциация конкретной реализации; `features/*.ts`
  импортируют только это, никогда не обращаются к БД напрямую.

Feature-модули, импортируемые напрямую из Client Components
(`features/auth.ts`, `features/tournaments.ts`, `features/achievements.ts`),
помечены `"use server"` — это компиляторная граница Next.js Server Actions,
не даёт Postgres-драйверу попасть в клиентский бандл. Подробное обоснование —
`docs/ADR-0001-server-actions-boundary.md` (актуальное архитектурное решение,
не историческая запись).

### Хранение файлов (аватары)

Локальная файловая система + nginx, без Supabase Storage и без S3/MinIO:

- `lib/repositories/avatar-storage/LocalAvatarStorageRepository.ts` пишет в
  `public/storage/avatars/{playerId}/avatar.{ext}`.
- На VPS это bind mount `./storage:/app/public/storage` (см. `compose.yaml`) —
  файлы переживают `docker compose build`/`down`.
- nginx отдаёт `/storage/*` напрямую с диска (`location ^~ /storage/`),
  минуя Node.js.

### Инфраструктура

- **VPS** — один сервер, на нём же живут два других независимых проекта
  (ReRaise, Poker Clock) в отдельных Docker-контейнерах и общий Postgres-
  контейнер с отдельными базой/пользователем на приложение.
- **Docker** — `Dockerfile` (4 стадии: `deps` → `builder` → `migrator` →
  `runner`), `compose.yaml` (сервисы `app` и одноразовый `migrate`).
- **nginx** (на хосте, вне Docker) — TLS-терминация (Let's Encrypt), reverse
  proxy на `127.0.0.1:3003`, редиректы apex→www и HTTP→HTTPS, раздача
  `/storage/*`.
- **Telegram** — webhook и Menu Button указывают на production-домен,
  Vercel полностью выведен из оборота.

---

## Структура проекта

```
app/                  Next.js App Router — страницы и API routes
  api/                REST API routes и Telegram webhook
  admin/              Админка
features/             Бизнес-логика (турниры, авторизация, достижения, ...)
lib/
  repositories/        Repository Layer (по одному подкаталогу на домен)
  db/                  Drizzle-схема (schema.ts) и миграции (migrations/)
  email-otp.ts         Бизнес-логика OTP
  resend.ts            Отправка email через Resend
  telegram-web-session.ts   Подпись/проверка сессионной cookie
  telegram-init-data.ts     Проверка Telegram Mini App initData
types/                 Domain- и database-типы
components/            Переиспользуемые UI-компоненты
scripts/               Деплой, бэкапы, миграции, разовые скрипты
deploy/nginx/          Референсная копия конфигурации nginx на VPS
docs/                  Документация (архитектура, деплой, история миграции)
sql/, migrations/      Устаревшие ручные SQL-скрипты Supabase-эпохи —
                       не используются, оставлены для истории; текущий
                       источник схемы — lib/db/schema.ts + lib/db/migrations/
```

---

## Локальный запуск

```bash
npm install
cp .env.example .env.local   # заполнить реальные значения (см. ниже)
npm run dev
```

Для локальной разработки нужен доступ к PostgreSQL (например, туннель к
VPS-инстансу или собственный локальный контейнер с той же схемой) и реальные
`TELEGRAM_BOT_TOKEN`/`RESEND_API_KEY`, если нужно тестировать соответствующие
сценарии end-to-end.

```bash
npm run build   # production-сборка
npm run lint    # eslint
npm test        # vitest run
```

---

## Production deployment

Полная инструкция — `docs/VPS_DEPLOYMENT.md`. Кратко:

```bash
# на VPS, из /opt/poker-app
git pull --ff-only origin main
docker compose build app
docker compose run --rm migrate   # если есть новые миграции схемы
docker compose up -d --no-deps --force-recreate app
```

Обновления через `scripts/deploy.sh`. nginx/DNS/TLS настраиваются один раз
(см. `deploy/nginx/dontworryclub.pro.conf`), обычный деплой их не трогает.

---

## Переменные окружения

Полный список с описаниями — `.env.example`. Кратко:

| Переменная | Назначение |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Публичный URL приложения — используется для абсолютных ссылок (аватары, письма) |
| `TELEGRAM_BOT_TOKEN` | Токен Telegram-бота — проверка initData, webhook, отправка сообщений |
| `SUPPORT_ADMIN_CHAT_ID` | Telegram chat_id админ-группы для support-сценария бота |
| `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID` | Service account для экспорта/импорта результатов в Google Sheets |
| `RESEND_API_KEY`, `EMAIL_FROM` | Отправка OTP-писем через Resend |
| `SESSION_SECRET` | Ключ HMAC для сессионной cookie и хеша OTP-кода |
| `DATABASE_URL` | Строка подключения к PostgreSQL |

**Больше не существует** (не добавлять обратно): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`DATABASE_PROVIDER` — все переменные и вся логика вокруг Supabase удалены
полностью, переключателя между провайдерами БД больше не существует.

---

## Документация

- `docs/AUTH_MIGRATION.md` — как устроена авторизация/OTP/сессии сейчас (актуально).
- `docs/ADR-0001-server-actions-boundary.md` — почему часть Feature-модулей помечена `"use server"` (актуальное архитектурное решение).
- `docs/VPS_DEPLOYMENT.md` — деплой на VPS (актуально).
- `docs/MIGRATION_PLAN.md`, `docs/POSTGRES_MIGRATION_ARCHITECTURE.md`, `docs/POSTGRES_MIGRATION_AUDIT.md`, `docs/BACKFILL_RUNBOOK.md` — архив: план и ход завершённой миграции Supabase → self-hosted (VPS/PostgreSQL/Resend/собственная авторизация). Не инструкции к действию, только история решений.
