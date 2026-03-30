# Sales CRM

Next.js (App Router) + Tailwind + Supabase: ежедневные отчёты, реестр поставщиков, админ-аналитика. Мутации через **Server Actions** (RLS на стороне БД).

## Настройка

1. Скопируйте `env.example` в `.env.local` и подставьте URL и anon/publishable key из Supabase (Settings → API).
2. `npm install` и `npm run dev`.

## Роли

- Новые пользователи получают профиль с ролью `manager` (триггер на `auth.users`).
- Администратора назначают вручную: `UPDATE profiles SET role = 'admin' WHERE id = '<uuid>';`

## Профили и цели

- `profiles.monthly_calls_target` (по умолчанию 660) — план звонков на календарный месяц.
- `profiles.monthly_sales_target` — план продаж на месяц (админ-график «факт vs план»).

## Формулы (дашборд менеджера)

- **Рабочие дни до конца месяца** (пн–пт): SQL `working_days_remaining_in_month(date)` и зеркало в `src/lib/crm-formulas.ts`.
- **Rolling daily calls**: `(monthly_calls_target − сумма звонков за месяц до выбранной даты) / рабочие_дни_осталось`, затем **G5**: если `gep_done > 2`, дневной лимит **12**, иначе **22**; итог = `ceil(min(rolling, лимит_G5))`, не ниже 0.

## Маршруты

- `/login` — Supabase Auth
- `/dashboard` — отчёт (Zod: неотрицательные числа, дата не в будущем), цель звонков в шапке, подсветка поля звонков при G5
- `/suppliers` — карточки (mobile) / таблица (desktop), статус и дата через server actions, заметки в `supplier_notes`
- `/admin` — лидерборд (продажи + gep_done/calls за месяц), график команды vs `monthly_sales_target`, прочие метрики

## БД

- `gep_events` — каждая проведённая презентация ГЭП (manager, supplier, дата); `daily_reports.gep_done` = число событий за день; не больше `gep_planned`.
- `supplier_notes` — заметки; RLS: менеджер видит только свои строки, админ — все.
- `suppliers.status` включает `gep_done` («ГЭП проведён») после записи в `gep_events`.
- `suppliers.sku_count` — для подсказки «готов к квалификации» (НКТ + KZ + SKU > 0).
