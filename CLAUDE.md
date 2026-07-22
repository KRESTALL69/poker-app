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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `python -m graphify query "<question>"` when graphify-out/graph.json exists. Use `python -m graphify path "<A>" "<B>"` for relationships and `python -m graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `python -m graphify update .` to keep the graph current (AST-only, no API cost).
