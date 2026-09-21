# Om CRM

Внутренняя CRM для отдела продаж/лидогенерации: ежедневные отчёты менеджеров, план/факт встреч, воронка "Крупный лид", заказы и комиссии, справочники контрагентов, ежедневная сводка в Telegram.

- **Фронтенд**: React 19 + TypeScript + Vite, деплой на Vercel.
- **Бэкенд**: Supabase (Postgres, Auth, Edge Functions, `pg_cron`).

## Быстрый старт

```bash
npm install
cp env.example .env.local   # заполнить своими значениями
npm run dev
```

## Документация

| Файл | Что внутри |
|---|---|
| [docs/HANDOVER.md](docs/HANDOVER.md) | Как полностью передать проект новому владельцу (GitHub/Vercel/Supabase/Telegram, секреты) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Стек, структура репозитория, навигация, модель ролей и авторизации |
| [docs/DATABASE.md](docs/DATABASE.md) | Схема БД, каталог RPC-функций, триггеры, `pg_cron`, RLS-модель |
| [docs/BUSINESS_LOGIC.md](docs/BUSINESS_LOGIC.md) | Ключевые бизнес-правила и история их отладки (обязательно прочитать перед правками в отчётах/встречах/КПИ) |
| [docs/FRONTEND_MODULES.md](docs/FRONTEND_MODULES.md) | Каталог экранов и модулей `src/components`/`src/lib` |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Переменные окружения, деплой Edge Functions, работа с секретами |

Начинать новому программисту стоит с `docs/ARCHITECTURE.md`, затем `docs/BUSINESS_LOGIC.md` — там вся неочевидная логика, которая не читается напрямую из кода.
