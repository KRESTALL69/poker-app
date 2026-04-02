alter table public.players
add column if not exists admin_display_name text;

comment on column public.players.admin_display_name is
'Внутренний ник/алиас игрока, видимый только администратору.';
