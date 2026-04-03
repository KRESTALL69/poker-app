-- Allow creating admin-added players without Telegram account binding.
ALTER TABLE public.players
  ALTER COLUMN telegram_id DROP NOT NULL;
