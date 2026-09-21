# Передача проекта: переезд на инфраструктуру нового владельца

Инструкция для развёртывания полностью независимой копии проекта на новой инфраструктуре: свой Supabase-проект, свой Telegram-бот, свой Vercel-проект. После выполнения всех шагов система работает полностью автономно, со всеми историческими данными на месте.

## Что нужно завести

| Сервис | Что заводится |
|---|---|
| Supabase | новый проект (свой `project-ref`, свой пароль БД, свой `service_role` ключ — генерируются автоматически) |
| Vercel | новый проект, подключённый к GitHub-репозиторию |
| Telegram | бот через @BotFather → токен и chat id |
| GitHub | доступ к коду репозитория (коллаборатор, форк, либо просто архив кода) |

## Шаг 1. Код

Получить доступ к репозиторию — как коллаборатор, через форк, либо просто архивом кода (`git archive` или zip на нужный коммит), из которого дальше делается `git init`. В коде и миграциях секретов нет.

## Шаг 2. Новый Supabase-проект — схема (таблицы, функции, триггеры)

1. Зарегистрировать Supabase-аккаунт, создать новый проект, выбрать регион, задать пароль БД.
2. Включить нужные расширения, если не включены по умолчанию: Database → Extensions → `pg_cron`, `pg_net`.
3. Локально (или в CI), используя свой `project-ref`:
   ```bash
   npx supabase link --project-ref <НОВЫЙ_REF>
   npx supabase db push
   ```
   Это накатит все файлы из `supabase/migrations/` и воссоздаст всю схему — таблицы, RPC-функции, триггеры, RLS-политики — с нуля.

## Шаг 3. Перенос данных

Схема после шага 2 пустая — нужно перелить сами данные (контрагенты, отчёты, встречи, заказы и т.д.) с исходной базы:

```bash
pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --no-owner --no-privileges -f om_data_dump.sql
```

(`$SUPABASE_DB_URL` — строка подключения исходной базы, см. `docs/DATABASE.md`.) Файл `om_data_dump.sql` содержит только строки бизнес-данных. Накатить на новую базу:

```bash
psql "$НОВЫЙ_SUPABASE_DB_URL" -f om_data_dump.sql
```

**Аккаунты сотрудников (Supabase Auth) переносить так не нужно** — `auth.users` намеренно не мигрируется (риск несовместимости версий/хешей, и это того не стоит для небольшого числа аккаунтов). После шага 4 все сотрудники заводятся заново через экран «Сотрудники» в самом приложении (те же логин-коды) — несколько минут работы.

## Шаг 4. Edge Functions на новом проекте

Деплой функций в новый проект:
```bash
npx supabase functions deploy create-staff --project-ref <НОВЫЙ_REF>
npx supabase functions deploy set-staff-password --project-ref <НОВЫЙ_REF>
npx supabase functions deploy revoke-staff-access --project-ref <НОВЫЙ_REF>
npx supabase functions deploy telegram-daily-report --project-ref <НОВЫЙ_REF>
npx supabase functions deploy telegram-enterprise-lead --project-ref <НОВЫЙ_REF>
```

И свои секреты (полный список — `docs/DEPLOYMENT.md`):
```bash
npx supabase secrets set STAFF_EMAIL_DOMAIN=om.staff --project-ref <НОВЫЙ_REF>
npx supabase secrets set TELEGRAM_BOT_TOKEN=<токен бота> --project-ref <НОВЫЙ_REF>
npx supabase secrets set TELEGRAM_CHAT_ID=<id чата> --project-ref <НОВЫЙ_REF>
npx supabase secrets set TELEGRAM_CRON_SECRET=<случайная строка> --project-ref <НОВЫЙ_REF>
npx supabase secrets set REPORT_TIMEZONE=Asia/Almaty --project-ref <НОВЫЙ_REF>
```
(`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет функциям сам, вручную задавать не нужно.)

## Шаг 5. Telegram-бот

Telegram → @BotFather → `/newbot` → получить токен. Добавить бота в рабочий чат/группу, узнать `chat_id` (проще всего — добавить бота в чат и дёрнуть `https://api.telegram.org/bot<token>/getUpdates` после любого сообщения в чате). Оба значения — в секреты на шаге 4.

## Шаг 6. pg_cron задачи на новом проекте

Задачи не хранятся в репозитории (см. `docs/DATABASE.md` — намеренно, чтобы не светить секрет в git). Создать их через SQL Editor, подставив свой `TELEGRAM_CRON_SECRET` из шага 4:

```sql
select cron.schedule(
  'telegram-daily-report',
  '30 13 * * *', -- 18:30 Алматы
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/telegram-daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-key', '<TELEGRAM_CRON_SECRET из шага 4>'
    ),
    body := jsonb_build_object('trigger', 'pg_cron', 'ts', now())
  );
  $$
);

select cron.schedule(
  'telegram-daily-report-results',
  '15 13 * * *', -- 18:15 Алматы
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/telegram-daily-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'anon_key'),
      'x-cron-key', '<TELEGRAM_CRON_SECRET из шага 4>'
    ),
    body := jsonb_build_object('trigger', 'pg_cron', 'ts', now(), 'section', 'results')
  );
  $$
);
```

`vault.decrypted_secrets` с именами `project_url`/`anon_key` в новом проекте нужно предварительно завести (Database → Vault) со значениями своего проекта — либо просто подставить URL/anon-key прямо текстом вместо подзапросов к vault, если так проще.

## Шаг 7. Vercel-проект

Vercel → Add New Project → Import Git Repository → выбрать репозиторий → задать переменные окружения (от нового Supabase-проекта):

| Переменная | Значение |
|---|---|
| `VITE_SUPABASE_URL` | URL нового Supabase-проекта |
| `VITE_SUPABASE_ANON_KEY` | anon-ключ нового Supabase-проекта |
| `VITE_STAFF_AUTH_DOMAIN` | тот же, что `STAFF_EMAIL_DOMAIN` из шага 4 |

→ Deploy.

## Итог

После этих 7 шагов — полностью рабочая независимая копия: свой Supabase, свой бот, свой Vercel, все исторические данные на месте, сотрудники заведены заново под своими логинами.

## Дальше — код

Для понимания самого кода/логики — `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/BUSINESS_LOGIC.md`, `docs/FRONTEND_MODULES.md`, `docs/DEPLOYMENT.md`.
