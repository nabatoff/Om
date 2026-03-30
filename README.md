# Sales CRM

Next.js (App Router) + Tailwind + Supabase: ежедневные отчёты менеджеров, реестр поставщиков, админ-аналитика.

## Настройка

1. Скопируйте `env.example` в `.env.local` и подставьте URL и anon/publishable key из Supabase (Settings → API).
2. `npm install` и `npm run dev`.

## Роли

- Новые пользователи получают профиль с ролью `manager` (триггер на `auth.users`).
- Администратора назначают вручную: в таблице `profiles` установите `role = 'admin'` для нужного `id`.

## Маршруты

- `/login` — вход и регистрация (Supabase Auth)
- `/dashboard` — форма ежедневного KPI-отчёта
- `/suppliers` — список поставщиков, смена статуса, добавление записи
- `/admin` — только для `admin`: конверсия поставщиков и агрегаты по отчётам

RLS в базе: менеджер видит строки, где `manager_id = auth.uid()` (или свои отчёты); админ видит всё.
