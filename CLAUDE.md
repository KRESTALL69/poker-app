# Project Context

## TL;DR

- Telegram Mini App + Web App для покерного клуба DWC / Don't Worry Club
- стек: Next.js + TypeScript + PostgreSQL (self-hosted, Drizzle) + Telegram Bot API + VPS/Docker/nginx
- Supabase и Vercel не используются — полностью self-hosted, см. `README.md`
- ключевая логика:
  - турниры
  - waitlist FIFO
  - рейтинг
  - support через Telegram bot
  - dual auth (Telegram + Email)
- стиль разработки:
  - минимальные изменения
  - без лишнего рефакторинга
  - не ломать существующие auth flows

---

# Что это

`Don't Worry Club` — это Telegram Mini App и web-приложение для покерных турниров.

Проект уже полностью развернут:

- отдельный GitHub repo
- собственный VPS (Docker + nginx), собственный PostgreSQL
- отдельный Telegram bot (webhook и Menu Button — на production-домен)
- собственный домен, HTTPS
- env variables настроены

Приложение уже работает в production:

- Telegram Mini App
- web login
- турниры
- waitlist
- рейтинг
- профиль
- админка
- support bot

---

# Архитектура

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- PostgreSQL (self-hosted, Drizzle ORM) — доступ только через Repository Layer (`lib/repositories/`)
- Собственная OTP-авторизация + собственные сессии (без Supabase Auth) — см. `docs/AUTH_MIGRATION.md`
- Локальное файловое хранилище для аватарок (без Supabase Storage)
- Telegram Mini App SDK
- Telegram Bot API
- Resend (отправка OTP-писем)
- Docker + nginx (VPS)

Подробнее — `README.md`, раздел «Архитектура».

---

# Основные сущности

## players

Игроки системы.

Могут быть:

- Telegram users
- email/web users
- manual users без Telegram

Важно:

- `telegram_id` может быть `null`
- `email` может быть `null`
- нельзя завязывать критическую логику только на Telegram

Основные поля:

- telegram_id
- username
- display_name
- email
- role
- accepted_terms_at
- profile_completed_at
- nickname_status
- requires_prepayment
- can_access_free
- can_access_paid
- can_access_cash

---

## tournaments

Турниры:

- дата
- описание
- лимиты
- тип
- статус
- buy-in
- location

---

## registrations

Регистрации на турниры.

Ключевая логика:

- FIFO waitlist
- отмены
- promoted from waitlist

---

## results

Результаты турниров:

- место
- knockouts
- points
- рейтинг

---

## app_settings

Глобальные настройки приложения.

Используется таблица:

```sql
app_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz
)
```

## Graphify

В проекте используется Graphify (`python -m graphify`, пакет `graphifyy`) для построения графа кодовой базы: узлы, "god nodes", сообщества, связи между файлами. Граф лежит в `graphify-out/` **внутри этого проекта** — не путать с графом соседних проектов (`reraise-miniapp` и др.).

Текущая конфигурация:
- Graphify не подключён как MCP-сервер в этой конфигурации — это CLI-инструмент, вызывается напрямую командой `python -m graphify ...`.
- Граф строится и обновляется в AST-only режиме, без обращения к внешним LLM / OpenRouter — `graphify update .` не требует API-ключа и не тратит токены.
- `query` / `path` / `explain` читают уже построенный `graph.json` напрямую и не требуют дополнительной платной настройки.

Правила:
- Перед архитектурно значимыми изменениями сначала обращаться к существующему графу, а не сразу к grep/чтению файлов.
- Для поиска архитектурного контекста использовать `python -m graphify query "<question>"`, `python -m graphify path "<A>" "<B>"`, `python -m graphify explain "<concept>"` — эти команды работают без дополнительной платной настройки.
- Если `graphify-out/wiki/index.md` существует, использовать его для навигации вместо чтения исходников напрямую.
- `graphify-out/GRAPH_REPORT.md` читать только для широкого архитектурного обзора либо когда query/path/explain не дали достаточно контекста.
- После изменений, затрагивающих связи между модулями, выполнять `python -m graphify update .`.
- Не выполнять полную пересборку (`graphify extract`), если достаточно `graphify update .`.
- Всегда запускать Graphify из корня текущего проекта.
- Перед командой проверять текущий рабочий каталог, чтобы случайно не обновить граф соседнего проекта.
- Никогда не индексировать секреты и `.env.local` — Graphify по умолчанию их исключает (встроенный фильтр `.env*`, ключи, credentials, tokens), но не полагаться на это вслепую при добавлении новых типов секретных файлов.
- `graphify-out/` каждого проекта хранится внутри этого проекта и не переносится в общую папку.
