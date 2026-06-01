# Project Context

## TL;DR

- Telegram Mini App + Web App для покерного клуба DWC / Don't Worry Club
- стек: Next.js + TypeScript + Supabase + Telegram Bot API + Vercel
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
- отдельный Vercel project
- отдельный Supabase project
- отдельный Telegram bot
- собственный домен
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
- Supabase
- Telegram Mini App SDK
- Telegram Bot API
- Vercel

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
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
