create table if not exists activity_events (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  event_type text not null,
  event_label text,
  metadata jsonb,
  platform text not null default 'unknown',
  session_id text,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_player_created
  on activity_events (player_id, created_at desc);
1
create index if not exists activity_events_type_created
  on activity_events (event_type, created_at desc);

create index if not exists activity_events_created
  on activity_events (created_at desc);

-- Retention policy: delete events older than 60 days.
--
-- Option A — manual cleanup (run ad-hoc or via a simple cron on your infra):
--   delete from activity_events where created_at < now() - interval '60 days';
--
-- Option B — pg_cron (recommended for Supabase).
--   1. Enable extension: Supabase Dashboard → Database → Extensions → pg_cron → Enable
--   2. Run once to register the job:
--
-- select cron.schedule(
--   'cleanup-activity-events',   -- job name (unique)
--   '0 3 * * *',                 -- daily at 03:00 UTC
--   $$delete from activity_events where created_at < now() - interval '60 days'$$
-- );
--
-- To verify the job was registered:
--   select * from cron.job;
--
-- To remove the job later:
--   select cron.unschedule('cleanup-activity-events');
