---
phase: quick-260407-vlm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - sql/enable_rls_tournaments_read_only.sql
autonomous: true
must_haves:
  truths:
    - "RLS включен для таблицы tournaments"
    - "anon и authenticated роли могут выполнять SELECT"
    - "INSERT, UPDATE, DELETE запрещены для anon и authenticated"
  artifacts:
    - path: "sql/enable_rls_tournaments_read_only.sql"
      provides: "SQL скрипт для настройки RLS"
  key_links: []
---

<objective>
Создать SQL файл для настройки Row Level Security на таблице tournaments с read-only доступом.

Purpose: Защитить таблицу tournaments от модификации через anon key Supabase, разрешив только SELECT.
Output: SQL файл в sql/, готовый к выполнению в Supabase SQL Editor.
</objective>

<execution_context>
@C:/Users/KRESTALL/poker-app/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/KRESTALL/poker-app/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@sql/make_players_telegram_id_nullable.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Создать SQL файл для RLS tournaments</name>
  <files>sql/enable_rls_tournaments_read_only.sql</files>
  <action>
Создать файл `sql/enable_rls_tournaments_read_only.sql` со следующим содержимым:

1. Включить RLS: `ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;`
2. Создать SELECT policy для anon и authenticated:
   ```sql
   CREATE POLICY "Allow read-only access to tournaments"
     ON public.tournaments
     FOR SELECT
     TO anon, authenticated
     USING (true);
   ```
3. Добавить комментарии на русском, объясняющие что делает каждая команда.
4. Добавить закомментированный блок проверки в конце файла:
   - SELECT запрос для проверки что данные читаются
   - INSERT запрос-пример который должен вернуть ошибку (закомментирован, для ручной проверки)
   - Запрос к pg_policies для просмотра активных policies

Стиль: следовать формату существующих SQL файлов в sql/ (комментарий сверху, минимальный SQL).

НЕ добавлять policies на INSERT/UPDATE/DELETE — при включённом RLS без policy эти операции автоматически запрещены.
  </action>
  <verify>
    <automated>cat sql/enable_rls_tournaments_read_only.sql | head -30</automated>
  </verify>
  <done>SQL файл существует, содержит ALTER TABLE ENABLE ROW LEVEL SECURITY и CREATE POLICY FOR SELECT, не содержит policies на INSERT/UPDATE/DELETE</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> Supabase | Клиент использует anon key, все запросы проходят через RLS |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-quick-01 | Tampering | tournaments table | mitigate | RLS включён, policy только на SELECT — INSERT/UPDATE/DELETE запрещены без явной policy |
| T-quick-02 | Elevation of Privilege | service_role key bypass | accept | service_role key обходит RLS by design, используется только в server-side API routes |
</threat_model>

<verification>
SQL файл содержит корректные команды для включения RLS и создания read-only policy.
После выполнения в Supabase SQL Editor:
- SELECT из tournaments работает
- INSERT/UPDATE/DELETE возвращают ошибку для anon/authenticated
</verification>

<success_criteria>
- SQL файл создан в sql/
- Содержит ENABLE ROW LEVEL SECURITY
- Содержит SELECT-only policy для anon и authenticated
- Не содержит policies на запись
- Содержит инструкции для проверки
</success_criteria>

<output>
After completion, create `.planning/quick/260407-vlm-read-only-tournaments-rls/260407-vlm-SUMMARY.md`
</output>
