# База данных (Supabase Postgres)

Проект Supabase (URL/`project-ref` — берётся из своего `.env.local`/Dashboard конкретного окружения; см. `docs/DEPLOYMENT.md`).

Вся бизнес-логика живёт в Postgres: таблицы простые и почти без ограничений на уровне RLS, а вся проверка прав и сложная логика (пересчёты, синхронизации, валидации) реализована в **SECURITY DEFINER RPC-функциях**, которые вызываются из фронтенда через `supabase.rpc(...)`. Фронтенд почти никогда не делает `INSERT/UPDATE` напрямую в таблицы — только через RPC. Это ключевой момент для понимания архитектуры: если что-то странно ведёт себя, скорее всего дело в одной из функций ниже, а не в компоненте.

## Модель ролей

Три роли в `profiles.role`: `admin`, `manager`, `lead_digger`.
- `admin` — видит всё, управляет сотрудниками, настройками, справочниками.
- `admin` + `admin_write = false` — админ "только на чтение" (аналитика/дашборды видны, изменения — нет). Используется для владельца/руководителя, которому не нужно ничего трогать руками.
- `manager` — заполняет свой ежедневный отчёт, ведёт своих клиентов, встречи, заказы.
- `lead_digger` ("лидоруб") — обзванивает базу, квалифицирует лиды, передаёт крупных клиентов ("Крупный лид") менеджерам.

Роль проверяется в БД через хелперы `is_admin()`, `is_admin_write()`, `is_sales_manager()`, `is_lead_digger()` (все `SECURITY DEFINER`, читают `profiles` по `auth.uid()`).

## Таблицы

| Таблица | Назначение | Ключевые поля |
|---|---|---|
| `profiles` | Аккаунты сотрудников (1:1 с `auth.users`) | `role`, `is_active`, `login_code`, `admin_write`, `default_daily_calls_plan`, `monthly_calls_target`, `monthly_sales_target` |
| `crm_reports` | Один ежедневный отчёт менеджера (шапка) | `report_date`, `manager`/`manager_id`, `processed_total`, `new_in_work`, `calls_total`, `validated_total`, `stage_transitions`, `staff_dept` (замороженный снимок отдела на момент создания отчёта — см. `docs/BUSINESS_LOGIC.md`) |
| `crm_assigned_meetings` | Запланированные встречи (план), привязаны к `crm_reports.id` | `entity_name`, `bin`, `meeting_date`, `meeting_type` (Новая/Повторная/Крупный лид), soft-delete через `deleted_at`/`deleted_by` |
| `crm_conducted_meetings` | Проведённые встречи (факт) | те же поля + `result` (итог встречи), `cp_sent`/`cp_quantity`/`cp_paid` (КП = коммерческое предложение) |
| `crm_confirmed_orders` | Подтверждённые заказы/продажи | `amounts[]`, `total_amount`, `via_entity_name`/`via_bin` (через какое юрлицо/посредника прошла сделка), `mrp_kzt_applied`, `is_ktp_applied`, `commission_amount` |
| `crm_clients` | Справочник контрагентов (БИН — естественный ключ) | `bin`, `manager_id`, `digger_id`, `category_id`, `business_scale` (`smb`/`enterprise`), `is_ktp`, `cp_paid`/`cp_paid_at`, `gz_turnover_prev_year`, `attraction_month` |
| `crm_client_categories` | Справочник категорий клиентов | `name`, `sort_order` |
| `crm_client_standalone_cp` | КП, отправленные вне контекста встречи | `manager_id`, `bin`, `cp_quantity`, `cp_paid` |
| `crm_enterprise_leads` | Лиды "Крупный лид" — воронка лидоруб → менеджер | `creator_id` (лидоруб), `distributor_id`, `assigned_manager_id`, `routing_status`, `meeting_status`, `assigned_meeting_id`, `meeting_requested`, `transferred_on`, `qualification_counted` |
| `crm_lead_events` | Аудит-лог действий по лиду | `lead_id`, `actor_id`, `action`, `payload jsonb` |
| `crm_kpi_field_history` | Аудит ручных правок шапки отчёта админом | `report_id`, `field`, `old_value`, `new_value`, `changed_by` |
| `crm_manager_blockers` | "Стопперы" менеджера по конкретному контрагенту | `manager_id`, `bin`, `description`, `status` (`active`/…), `resolved_at`, `resolved_report_date` |
| `crm_manager_work_items` | Активные "в работе" пункты менеджера, привязаны к отчёту | `status`, `next_step`, `deadline`, `blockers` |
| `crm_ens_tru_codes` | Справочник кодов ЕНС ТРУ (для проверки на публичной странице) | `code`, `name`, `category` |
| `crm_settings` | Универсальный key/value для настроек | `key`, `value_numeric` (МРП, недельный прогноз для Telegram и т.д.) |

Внешние ключи почти все указывают на `profiles.id` (кто менеджер/лидоруб/автор) и на `crm_reports.id` (владеющий отчёт дня). `crm_enterprise_leads.bin` ссылается на `crm_clients.bin`.

## RLS-модель

RLS включена на всех таблицах, но политики почти везде — «разрешено всем `authenticated`» (`ALL`/`SELECT`/`INSERT`/… для роли `authenticated`, без построчной фильтрации по владельцу). Это значит: **реальная авторизация («менеджер видит только своё», «только админ может…») реализована не в RLS, а внутри RPC-функций** (проверки `is_admin()`, сравнение `manager_id = auth.uid()` и т.д.) и частично на фронтенде. Это осознанное архитектурное решение в проекте — при доработках проверяйте права внутри новых RPC, не полагаясь на RLS.

Единственное исключение — `profiles`: там RLS реально ограничивает `SELECT`/`INSERT`/`UPDATE` только собственной строкой (`profiles_self_*`), поэтому список сотрудников для админки читается не напрямую, а через отдельные функции/edge functions с `service_role`.

## Каталог RPC-функций (76 шт, все в схеме `public`)

### Роли/доступ
`is_admin`, `is_admin_write`, `is_lead_digger`, `is_sales_manager`, `user_may_access_crm_report(rid)`, `user_may_write_crm_report_row(m|mid)`

### Сохранение отчёта/КПИ
`save_crm_report(payload)` — главный upsert отчёта дня (шапка + встречи + заказы одним вызовом), `save_crm_kpi(payload)` — только шапка КПИ, `ensure_crm_report_for_manager/staff` — гарантирует существование строки `crm_reports` на дату, `log_crm_kpi_field_change` — пишет аудит в `crm_kpi_field_history`

### Клиенты/справочники
`update_crm_client`, `set_crm_client_manager`, `set_crm_client_digger`, `set_crm_client_ktp`, `set_crm_client_cp_paid` (2 перегрузки), `set_crm_client_profile`, `set_client_business_scale`, `upsert_crm_client_category`, `delete_crm_client_category`, `guard_crm_client_profile_fields` (триггер-функция — валидирует поля при записи `crm_clients`)

### КП вне встречи / КП на встрече
`upsert_client_standalone_cp`, `set_client_standalone_cp_paid`, `set_conducted_meeting_cp_paid`

### Заказы и комиссия
`admin_create_confirmed_order`, `admin_update_confirmed_order`, `calc_order_commission(amount, is_ktp, mrp)`, `count_order_line_items`, `sum_order_line_commissions`, `count_orders_without_commission`, `backfill_order_commissions(overwrite)`, `recalc_order_commissions_for_client_bin(bin)`, `recalc_order_commissions_for_month(year, month)`, `crm_order_commission_is_ktp`, `crm_validate_order_via`, `crm_confirmed_orders_validate_via` (триггер на `crm_confirmed_orders`)

> Комиссия считается по формуле в `calc_order_commission`, зависит от того, КТП ли клиент (`is_ktp`) и текущего МРП (`crm_settings`). См. `docs/BUSINESS_LOGIC.md`.

### Воронка "Крупный лид" (enterprise leads)
`admin_assign_enterprise_lead`, `admin_clear_returned_leads`, `admin_delete_enterprise_lead`, `admin_delete_returned_lead`, `admin_set_enterprise_lead_status`, `digger_transfer_enterprise_batch(report_date, items)` — лидоруб передаёт пачку лидов, `list_enterprise_leads(filter)`, `list_lead_events(lead_id)`, `log_crm_lead_event`, `manager_return_lead_to_smb`, `manager_set_lead_meeting_status(lead_id, status, result)`, `manager_take_enterprise_lead_in_work`, `sync_enterprise_lead_for_krup_meeting` + триггеры `trg_sync_enterprise_lead_from_meeting` на `crm_assigned_meetings`/`crm_conducted_meetings` (держат `crm_enterprise_leads` в консистентном состоянии при правках встреч), `lead_digger_conversion_stats`

### Блокеры и активные задачи менеджера
`create_manager_blocker`, `list_manager_blockers`, `resolve_manager_blocker`, `count_resolved_blockers`, `list_crm_work_items_for_date`, `list_manager_work_items`, `save_crm_work_items`

### Отдел сотрудника (снимок)
`resolve_staff_dept_for_manager`, триггер `trg_stamp_report_staff_dept` на `crm_reports` (проставляет `staff_dept` при создании строки — не пересчитывается задним числом, см. `docs/BUSINESS_LOGIC.md`)

### Настройки
`get_crm_mrp`/`set_crm_mrp`, `get_crm_telegram_weekly_forecast`/`set_crm_telegram_weekly_forecast`, `get_crm_admin_analytics_tab_enabled`/`set_crm_admin_analytics_tab_enabled`

### ЕНС ТРУ
`check_ens_tru_codes(codes[])`, `normalize_ens_tru_code(raw)`

### Telegram-отчёты (вызываются из edge function `telegram-daily-report`)
`telegram_daily_analytics_rows(date)`, `telegram_daily_manager_rows(date)`, `telegram_daily_digger_rows(date)`, `telegram_confirmed_orders_totals(tz[, date])`

### Разное
`working_days_remaining_in_month(ref)`

## Триггеры

| Таблица | Триггер | Функция | Что делает |
|---|---|---|---|
| `crm_clients` | `guard_crm_client_profile_fields` | `guard_crm_client_profile_fields` | Валидация/защита полей профиля клиента при записи |
| `crm_confirmed_orders` | `trg_crm_confirmed_orders_validate_via` | `crm_confirmed_orders_validate_via` | Проверяет корректность пары `via_entity_name`/`via_bin` |
| `crm_reports` | `trg_crm_reports_stamp_staff_dept` | `trg_stamp_report_staff_dept` | Замораживает `staff_dept` при вставке строки отчёта |
| `crm_assigned_meetings` | `trg_assigned_sync_enterprise_lead` | `trg_sync_enterprise_lead_from_meeting` | Синхронизирует `crm_enterprise_leads` при правке плановой встречи "Крупный лид" |
| `crm_conducted_meetings` | `trg_conducted_sync_enterprise_lead` | `trg_sync_enterprise_lead_from_meeting` | То же для факта встречи |

## pg_cron задачи

Проверить/изменить: SQL Editor → `select * from cron.job;` (или психл: `psql "$SUPABASE_DB_URL" -c "select * from cron.job;"`).

| jobid | name | schedule (UTC) | Алматы | Что шлёт |
|---|---|---|---|---|
| 1 | `telegram-daily-report` | `30 13 * * *` | 18:30 | Основной ежедневный отчёт (без "Итогов дня", без сводки лидорубов) |
| 2 | `telegram-daily-report-results` | `15 13 * * *` | *(опечатка в имени job'а не влияет — реально это отдельный, чуть более ранний вызов)* 18:15 | Только "Итоги дня" (`section: 'results'` в теле запроса) |

**Важно:** обе задачи хранят секрет `x-cron-key` **прямо в тексте `cron.job.command`**, не в файле миграции и не в `Vault`/Secrets. Это сделано намеренно, чтобы не коммитить секрет в git. Если нужно посмотреть/изменить эти задачи — это делается через SQL Editor или psql, не через файлы репозитория. При ротации `TELEGRAM_CRON_SECRET` (Edge Function secret) нужно **также** обновить `x-cron-key` в обеих `cron.job.command` через `cron.alter_job(jobid, command := ...)`.

## Расширения

`pg_cron`, `pg_net` (HTTP-вызовы из cron), `pgcrypto`, `uuid-ossp`, `supabase_vault` (используется для `project_url`/`anon_key` в теле cron-задач), `pg_stat_statements`.

## Миграции

68 файлов в `supabase/migrations/`, с `20260426...` по `20260918...`. Именование — `YYYYMMDDHHMMSS_описание.sql`. Применяются командой `npx supabase db push --project-ref <ваш-project-ref>` (или вручную через SQL Editor). **Важно:** не все изменения в базе присутствуют как файлы миграций — несколько точечных правок (см. `docs/HANDOVER.md`, раздел «Секреты») были применены напрямую через `psql`, чтобы не закоммитить секрет в git. Если нужен 100%-но точный дамп текущей схемы — использовать `pg_dump` или `supabase db dump`, а не полагаться только на папку `migrations/`.

## Как подключиться к базе напрямую

Прямой хост `db.<ref>.supabase.co:5432` — только IPv6, часто недоступен из окружений без IPv6. Рабочий вариант — Supavisor pooler (пример формата строки, значения — свои для каждого проекта):

```bash
psql "postgresql://postgres.<project-ref>:<PASSWORD>@<pooler-хост-из-Dashboard>:5432/postgres"
```

Пароль и точный хост/регион пулера — Supabase Dashboard → Project Settings → Database → Connection string (там же пароль ротируется). Эти значения у каждого проекта свои — не переиспользовать значения из другого проекта.
