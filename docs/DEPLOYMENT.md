# Деплой и окружения

## Фронтенд (Vercel)

Автодеплой на каждый push в `main` (Git-интеграция Vercel ↔ GitHub-репозиторий проекта). Ручных шагов не требуется — `git push` уже равно "выкатили".

Build: `npm run build` (= `tsc -b && vite build`), output — `dist/`. `vercel.json` рероутит все пути (кроме `/api/*`) на `index.html` — это SPA без серверного роутинга.

### Переменные окружения (Vercel → Project Settings → Environment Variables)

| Переменная | Назначение |
|---|---|
| `VITE_SUPABASE_URL` (или `NEXT_PUBLIC_SUPABASE_URL`) | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` (или `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | Публичный anon-ключ Supabase |
| `VITE_STAFF_AUTH_DOMAIN` (или `STAFF_EMAIL_DOMAIN`) | Домен для синтетического email логина сотрудников — **должен совпадать** с секретом `STAFF_EMAIL_DOMAIN` у Edge Function `create-staff` |
| `VITE_TELEGRAM_REPORT_WEBHOOK_URL` | (опционально) прямой вебхук для мгновенного уведомления о новом лиде, вместо вызова Edge Function |

`vite.config.ts` явно вшивает эти значения в бандл на этапе сборки (`define`) — значит, **после смены переменной в Vercel нужен Redeploy** (просто новый пуш не требуется, но без передеплоя новое значение не подхватится).

## Backend: Supabase

### Миграции

```bash
npx supabase db push --project-ref <ваш-project-ref>
```

или применение конкретного файла вручную через SQL Editor / `psql -f <file>`. **Миграции не деплоятся автоматически** — это ручной шаг после мержа в `main`, если изменения были в `supabase/migrations/`.

### Edge Functions — деплоятся ОТДЕЛЬНО, НЕ автоматически

```bash
npx supabase functions deploy <имя-функции> --project-ref <ваш-project-ref>
```

Список функций: `create-staff`, `set-staff-password`, `revoke-staff-access`, `telegram-daily-report`, `telegram-enterprise-lead`. **Каждый раз после правки кода в `supabase/functions/<name>/` нужно вручную передеплоить именно эту функцию** — иначе прод продолжит работать на старой версии, а git будет "врать", что всё обновлено.

### Секреты Edge Functions (Dashboard → Edge Functions → Secrets, или `supabase secrets set`)

| Секрет | Где используется |
|---|---|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | все функции, работающие с Auth/БД от имени service role |
| `STAFF_EMAIL_DOMAIN` | `create-staff` (должен совпадать с фронтендовым `VITE_STAFF_AUTH_DOMAIN`) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | `telegram-daily-report`, `telegram-enterprise-lead` |
| `TELEGRAM_CRON_SECRET` | `telegram-daily-report` — сверяется с заголовком `x-cron-key`, который шлёт `pg_cron` |
| `REPORT_TIMEZONE` | `telegram-daily-report` (по умолчанию `Asia/Almaty`, если не задан) |

### pg_cron задачи

Не хранятся ни в одном файле репозитория намеренно (чтобы не закоммитить `x-cron-key` в открытом виде). Смотреть/менять — через SQL Editor Supabase или `psql`:

```sql
select * from cron.job;
```

Изменить расписание/тело существующей задачи:

```sql
select cron.alter_job(job_id := <id>, schedule := '...', command := $$...$$);
```

Полный список текущих задач и что они делают — `docs/DATABASE.md`.

**При ротации `TELEGRAM_CRON_SECRET`**: изменить секрет у Edge Function, а затем **отдельно** обновить строку `'x-cron-key', '...'` в `command` обеих задач `cron.job` — секрет не подтягивается автоматически, он захардкожен в теле SQL-задачи.

### Прямое подключение к БД (для отладки/ad-hoc SQL)

Прямой хост `db.<ref>.supabase.co` — только IPv6. Рабочий вариант — Supavisor pooler (регион и хост уточнять в Dashboard → Settings → Database → Connection string — у каждого проекта свои, юзер вида `postgres.<project-ref>`):

```bash
psql "postgresql://postgres.<project-ref>:<PASSWORD>@<pooler-хост-из-Dashboard>:5432/postgres"
```

## Локальная разработка

```bash
npm install
npm run dev
```

Нужен `.env.local` (не коммитится) с `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` — см. `env.example`.

## Проверка перед тем как считать деплой готовым

1. `npm run build` проходит без ошибок TypeScript (сборка = `tsc -b && vite build`, тайпчек — часть сборки, не отдельный шаг).
2. Если менялись Edge Functions — они задеплоены (`supabase functions deploy`), не только запушены в git.
3. Если менялась схема БД — миграция применена к проду, не только лежит файлом в репозитории.
4. Если менялся Telegram-отчёт — стоит один раз прогнать вручную (`?preview=png` для картинки, или прямой POST на функцию с нужным `section`) прежде чем ждать следующего cron-тика.
