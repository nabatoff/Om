# Передача проекта новому владельцу — без доступа к вашим личным аккаунтам

Ваш случай: Supabase, Vercel и Telegram-бот — на **личных** аккаунтах, отдавать доступ к ним вы не хотите. Решение — не «передача аккаунта», а **переезд** на инфраструктуру нового владельца: он заводит свой Supabase-проект, свой Telegram-бот, свой Vercel-проект, и получает полностью рабочую копию системы. Единственное, что физически переезжает от вас к нему — код (через GitHub) и один файл с данными (см. шаг 3). Ни пароль от Supabase, ни токен Telegram-бота, ни доступ к вашему Vercel ему не нужны.

## Что нужно новому владельцу завести самому

| Сервис | Что заводит новый владелец |
|---|---|
| Supabase | свой аккаунт → новый проект (свой `project-ref`, свой пароль БД, свой `service_role` ключ — генерируются автоматически) |
| Vercel | свой аккаунт → новый проект, подключённый к тому же (или форкнутому) GitHub-репозиторию |
| Telegram | свой бот через @BotFather → свой токен и chat id |
| GitHub | доступ к коду — самый простой вариант ниже, но если GitHub-аккаунт тоже личный и его не хочется светить — см. альтернативу в конце шага 1 |

## Шаг 1. Код

Самый простой вариант — добавить нового разработчика коллаборатором в текущий репозиторий (GitHub → Settings → Collaborators) или переслать ему инвайт на форк. В коде и миграциях секретов нет (проверено) — можно передавать свободно.

Если GitHub-аккаунт репозитория тоже личный и добавлять туда постороннего не хочется — ещё проще: просто отдать архив кода (`git archive` или zip репозитория на нужный коммит) файлом, без какого-либо доступа к вашему GitHub. Новый разработчик у себя делает `git init` в полученной папке и дальше работает как с обычным репозиторием, при желании создав свой собственный на GitHub/GitLab.

## Шаг 2. Новый Supabase-проект — схема (таблицы, функции, триггеры)

Новый владелец:
1. Регистрирует свой Supabase-аккаунт, создаёт новый проект, выбирает регион, задаёт пароль БД.
2. Включает нужные расширения, если не включены по умолчанию: Database → Extensions → `pg_cron`, `pg_net`.
3. У себя локально (или в CI) выполняет, используя **свой** `project-ref`:
   ```bash
   npx supabase link --project-ref <НОВЫЙ_REF>
   npx supabase db push
   ```
   Это накатит все 68 файлов из `supabase/migrations/` и воссоздаст **всю** схему — таблицы, RPC-функции, триггеры, RLS-политики — с нуля, без единого обращения к вашей базе.

## Шаг 3. Перенос данных (единственное, что реально «переезжает» от вас)

Схема пустая после шага 2 — нужно перелить сами данные (контрагенты, отчёты, встречи, заказы и т.д.). Это делаете **вы**, находясь у своей базы, и отдаёте новому владельцу **файл**, а не доступ:

```bash
pg_dump "$SUPABASE_DB_URL" --data-only --schema=public --no-owner --no-privileges -f om_data_dump.sql
```

(`$SUPABASE_DB_URL` — ваша текущая строка подключения, см. `docs/DATABASE.md`.) Файл `om_data_dump.sql` содержит только строки бизнес-данных — ни паролей, ни ключей, ни доступа к вашему аккаунту в нём нет. Передаёте файл новому владельцу любым удобным каналом, он у себя накатывает:

```bash
psql "$НОВЫЙ_SUPABASE_DB_URL" -f om_data_dump.sql
```

**Аккаунты сотрудников (Supabase Auth) переносить так не нужно** — специально не мигрируем `auth.users` (риск несовместимости версий/хешей + это того не стоит для ~9 аккаунтов). Вместо этого после шага 4 новый владелец просто заново заводит всех сотрудников через экран «Сотрудники» в самом приложении (кнопка добавления, эти же логин-коды) — 5 минут работы.

## Шаг 4. Edge Functions на новом проекте

Новый владелец деплоит функции в свой проект:
```bash
npx supabase functions deploy create-staff --project-ref <НОВЫЙ_REF>
npx supabase functions deploy set-staff-password --project-ref <НОВЫЙ_REF>
npx supabase functions deploy revoke-staff-access --project-ref <НОВЫЙ_REF>
npx supabase functions deploy telegram-daily-report --project-ref <НОВЫЙ_REF>
npx supabase functions deploy telegram-enterprise-lead --project-ref <НОВЫЙ_REF>
npx supabase functions deploy goszakup-contracts-export --project-ref <НОВЫЙ_REF>
```

И задаёт **свои собственные** секреты (см. полный список в `docs/DEPLOYMENT.md`):
```bash
npx supabase secrets set STAFF_EMAIL_DOMAIN=om.staff --project-ref <НОВЫЙ_REF>
npx supabase secrets set TELEGRAM_BOT_TOKEN=<токен своего бота> --project-ref <НОВЫЙ_REF>
npx supabase secrets set TELEGRAM_CHAT_ID=<id своего чата> --project-ref <НОВЫЙ_REF>
npx supabase secrets set TELEGRAM_CRON_SECRET=<любая своя случайная строка> --project-ref <НОВЫЙ_REF>
npx supabase secrets set REPORT_TIMEZONE=Asia/Almaty --project-ref <НОВЫЙ_REF>
```
(`SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` Supabase подставляет функциям сам, вручную задавать не нужно.)

## Шаг 5. Свой Telegram-бот

Новый владелец: Telegram → @BotFather → `/newbot` → получает свой токен. Добавляет бота в свой рабочий чат/группу, узнаёт `chat_id` (проще всего — временно добавить бота в чат и дёрнуть `https://api.telegram.org/bot<token>/getUpdates` после любого сообщения в чате). Оба значения уходят в секреты на шаге 4.

## Шаг 6. pg_cron задачи на новом проекте

Задачи не хранятся в репозитории (см. `docs/DATABASE.md` — так сделано специально, чтобы не светить секрет в git). Новый владелец создаёт их у себя через SQL Editor, подставляя свой `TELEGRAM_CRON_SECRET` из шага 4:

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

`vault.decrypted_secrets` с именами `project_url`/`anon_key` в новом проекте нужно предварительно завести самому (Database → Vault) со значениями своего проекта — либо просто подставить URL/anon-key нового проекта прямо текстом вместо подзапросов к vault, если так проще.

## Шаг 7. Свой Vercel-проект

Новый владелец: Vercel → Add New Project → Import Git Repository → выбрать репозиторий → задать переменные окружения (свои, от нового Supabase-проекта):

| Переменная | Значение |
|---|---|
| `VITE_SUPABASE_URL` | URL нового Supabase-проекта |
| `VITE_SUPABASE_ANON_KEY` | anon-ключ нового Supabase-проекта |
| `VITE_STAFF_AUTH_DOMAIN` | тот же, что `STAFF_EMAIL_DOMAIN` из шага 4 |

→ Deploy. Полностью независимо от вашего аккаунта Vercel.

## Итог

После этих 7 шагов у нового владельца — полностью рабочая независимая копия: свой Supabase, свой бот, свой Vercel, все исторические данные на месте, сотрудники заведены заново под своими логинами. Ваши личные аккаунты остаются полностью в вашем распоряжении и никак не участвуют в работе новой инсталляции — можно спокойно удалить проект на своей стороне после того, как новый владелец подтвердит, что всё работает.

## Дальше — код

Для понимания самого кода/логики — `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/BUSINESS_LOGIC.md`, `docs/FRONTEND_MODULES.md`, `docs/DEPLOYMENT.md`.
