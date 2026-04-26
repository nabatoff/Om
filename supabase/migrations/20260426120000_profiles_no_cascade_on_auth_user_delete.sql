-- Раньше при удалении auth.users срабатывал ON DELETE CASCADE и удалялся profiles — терялось ФИО в справочнике.
-- Строка profiles должна сохраняться: имя остаётся в данных (отчёты пишут manager как текст) и в карточке сотрудника.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;
