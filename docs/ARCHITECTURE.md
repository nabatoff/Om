# Архитектура

## Стек

- **Фронтенд**: React 19 + TypeScript + Vite 6, без роутера (react-router не используется). Стили — Tailwind CSS. Иконки — `lucide-react`. Excel-экспорт — `exceljs`.
- **Бэкенд**: Supabase — Postgres, Auth, Edge Functions (Deno), `pg_cron`/`pg_net` для планировщика, Vault для пары секретов, используемых внутри cron-задач.
- **Хостинг фронтенда**: Vercel, автодеплой на пуш в `main` (см. `vercel.json` — SPA-рероутинг всех путей на `index.html`, кроме `/api/*`).
- **Хостинг бэкенда**: Supabase Cloud (URL/`project-ref` — свой для каждого окружения, см. `docs/DEPLOYMENT.md`).
- **Уведомления**: Telegram Bot API — ежедневные отчёты (по расписанию) и точечные уведомления о новых лидах.

Никакого отдельного backend-сервера нет — весь "сервер" это Postgres + RPC + Edge Functions.

## Структура репозитория

```
src/
  App.tsx                 — единая точка входа UI, ~18k строк суммарно по репо, вся навигация и большая часть экранов
  PublicEnsTruPage.tsx    — публичная страница /enstru (без логина)
  main.tsx                — точка входа, ручной pathname-чек для /enstru
  context/
    AuthContext.tsx       — сессия, профиль, роли (isAdmin/canAdminWrite/isLeadDigger)
  components/             — экраны и модалки (см. docs/FRONTEND_MODULES.md)
  lib/                    — вся бизнес-логика и обёртки над supabase.rpc(...) (см. docs/FRONTEND_MODULES.md, docs/BUSINESS_LOGIC.md)
supabase/
  migrations/             — 68 SQL-миграций (не 100% полная история — см. docs/DATABASE.md)
  functions/              — Edge Functions (Deno)
    create-staff/
    set-staff-password/
    revoke-staff-access/
    telegram-daily-report/
    telegram-enterprise-lead/
    goszakup-contracts-export/
    _shared/              — общий код для telegram-daily-report (текст отчёта, PNG-рендер, типы)
```

## Навигация (без роутера)

`App.tsx` держит навигацию в state, а не в URL:

```ts
type CurrentView =
  | 'manager' | 'admin' | 'orders' | 'clients' | 'clientsOrders'
  | 'registry' | 'goszakupContracts' | 'ensTru' | 'diggerLeads';
```

плюс вложенный `adminSubView` для вкладок внутри админки (`salesDashboard`, `dashboard`, `kpi`, `staff`, `meetings`, `settings`, `enterpriseLeads`, `enterpriseLeadsAll`, `diggerConversion`). Текущий вид сохраняется в `localStorage` (`om.currentView`, `om.adminSubView` и т.д.), поэтому при перезагрузке страницы пользователь остаётся там же, где был — но URL в адресной строке при этом не меняется (кроме `/enstru`).

Единственное исключение из этой модели — `src/main.tsx` вручную проверяет `window.location.pathname === '/enstru'` и рендерит `PublicEnsTruPage` вместо `App`, минуя всю авторизацию. Это единственный публичный (без логина) маршрут в приложении.

Если новый программист захочет добавить нормальный роутинг (react-router) — это будет полноценный рефакторинг навигационного слоя `App.tsx`, а не мелкая правка.

## Роли и авторизация

Три роли (`profiles.role`): `admin`, `manager`, `lead_digger`. Дополнительный флаг `profiles.admin_write` даёт "админа только на чтение" (видит аналитику, не может ничего изменить — используется для владельца бизнеса).

`AuthContext` (`src/context/AuthContext.tsx`) — единственный источник правды на фронтенде:

```ts
{ session, user, profile, ready, isAdmin, canAdminWrite, isLeadDigger, managerName, signIn, signOut }
```

- `isAdmin = profile.role === 'admin' && profile.is_active !== false`
- `canAdminWrite = isAdmin && profile.admin_write !== false`
- `isLeadDigger = profile.role === 'lead_digger' && profile.is_active !== false`

Если `profiles.is_active` становится `false` (сотрудника уволили/деактивировали), контекст сам разлогинивает пользователя при следующей загрузке профиля.

**Важно:** авторизация проверяется на трёх уровнях одновременно — (1) UI прячет недоступные разделы по этим флагам, (2) RPC-функции в базе повторно проверяют роль через `is_admin()`/`is_sales_manager()`/`is_lead_digger()`, (3) RLS почти везде разрешает всё аутентифицированным пользователям (см. `docs/DATABASE.md`). То есть **пункт (2) — единственная реальная линия защиты**, пункты (1) и (3) её не заменяют. При добавлении новых RPC всегда проверять роль внутри функции.

## Аутентификация сотрудников — не email, а логин-код

Сотрудники **не регистрируются сами** и не входят по email. У каждого — короткий логин-код (`profiles.login_code`, 2-32 символа, `[a-z0-9_]`). Клиент превращает его в синтетический email `<login>@<STAFF_EMAIL_DOMAIN>` (по умолчанию `om.staff`) и вызывает обычный `supabase.auth.signInWithPassword(email, password)` — то есть под капотом это настоящий Supabase Auth, просто с искусственным email, который пользователь никогда не видит.

Домен обязан совпадать в двух местах:
- фронтенд: `VITE_STAFF_AUTH_DOMAIN` (или `STAFF_EMAIL_DOMAIN` — читается в `vite.config.ts`)
- Edge Function `create-staff`: secret `STAFF_EMAIL_DOMAIN`

Если они разойдутся — логин будет пытаться зайти на `login@X`, а аккаунт в Auth создан как `login@Y`, и вход не сработает.

Жизненный цикл аккаунта — только через админку (`StaffManager.tsx`) и три service-role Edge Functions:
- `create-staff` — создаёт пользователя в Auth (`email_confirm: true`) + строку в `profiles`.
- `set-staff-password` — меняет пароль через `auth.admin.updateUserById`.
- `revoke-staff-access` — `profiles.is_active = false`, чистит `login_code`, банит пользователя в Auth на ~27 лет (`ban_duration`). Отказывается разжаловать последнего активного админа.

Все три функции сами проверяют, что вызывающий — активный админ с `admin_write !== false`.

## Переменные окружения (фронтенд, Vercel)

См. `env.example` в корне репозитория и `docs/DEPLOYMENT.md` — там же список секретов Edge Functions.
