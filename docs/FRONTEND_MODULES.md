# Каталог фронтенд-модулей

Справочник "что за экран/файл и зачем" для быстрой ориентации. Подробности бизнес-правил — в `docs/BUSINESS_LOGIC.md`, схема БД — в `docs/DATABASE.md`.

## Экраны верхнего уровня (`App.tsx` → `CurrentView`)

| View | Кто видит | Назначение |
|---|---|---|
| `manager` | все роли (свой контент) | Ежедневный отчёт менеджера/лидоруба: шапка КПИ, встречи (план/факт), заказы, work items |
| `admin` | admin | Многовкладочная админка (см. `adminSubView` ниже) |
| `orders` | admin | Реестр всех подтверждённых заказов, фильтры, Excel-экспорт (по записям и по контрагентам) |
| `clients` | admin | Каталог контрагентов (см. "Клиентский справочник" ниже) |
| `clientsOrders` | manager | Объединённый экран менеджера: свои клиенты + свои заказы (переключатель `clientsOrdersSubView`) |
| `registry` | manager | `SupplierRegistryPanel` — аналитика по поставщикам (когорты/по годам) |
| `goszakupContracts` | admin (write) | Выгрузка контрагента по Госзакупу в Excel |
| `ensTru` | admin | Проверка кодов ЕНС ТРУ (внутри приложения) |
| `diggerLeads` | lead_digger | `LeadDiggerLeadsPanel` — лиды лидоруба, передача в "Крупный лид" |

`adminSubView`: `salesDashboard`, `dashboard`, `kpi`, `staff`, `meetings`, `enterpriseLeads`, `enterpriseLeadsAll`, `diggerConversion`, `settings`.

## Компоненты (`src/components/`)

| Файл | Назначение |
|---|---|
| `LoginView.tsx` | Форма входа по логин-коду + паролю (см. `docs/ARCHITECTURE.md` про синтетический email) |
| `StaffManager.tsx` | Админ-экран сотрудников: создание/деактивация/смена пароля через Edge Functions `create-staff`/`revoke-staff-access`/`set-staff-password` |
| `AdminSettingsPanel.tsx` | Глобальные настройки: МРП, видимость вкладки аналитики, категории клиентов, бэкафилл комиссий по заказам без неё |
| `AdminFilters.tsx` | Общие UI-фильтры для админских списков |
| `AdminBlockersPanel.tsx` | Сводка активных "блокеров" по всем менеджерам (read-only, для KPI-дашборда) |
| `ManagerBlockersPanel.tsx` | Менеджер заводит/снимает блокер по конкретному контрагенту; снятие блокера засчитывается в KPI дня |
| `ManagerWorkItemsPanel.tsx` | Мини-канбан "в работе" на менеджера/день: статус, следующий шаг, дедлайн |
| `ManagerMeetingsPanel.tsx` | Список встреч менеджера (план/факт) на дату |
| `ManagerEnterpriseLeadsPanel.tsx` | "Мои лиды Крупный бизнес" у менеджера — взять в работу / провести встречу / вернуть в SMB |
| `EnterpriseLeadsBuffer.tsx` | Буфер нераспределённых лидов "Крупный лид" (для админа/распределителя) |
| `EnterpriseLeadsAllPanel.tsx` | Полный список всех лидов "Крупный лид" у админа, с фильтром по месяцу передачи |
| `LeadDiggerLeadsPanel.tsx` | Экран лидоруба: свои лиды, передача пачкой в "Крупный лид", колонка "итог встречи" |
| `LeadDiggerConversionDashboard.tsx` | Таблица "передано → доведено до встречи" по каждому лидорубу, % конверсии |
| `DiggerTransferModal.tsx` | Модалка пакетной передачи лидов лидорубом (БИН/имя/флаг "встреча назначена" на каждую строку) |
| `KpiDashboard.tsx` | Главный админский КПИ-дашборд: звонки/квалификация/встречи/заказы по менеджерам, встраивает `AdminBlockersPanel` и `RnpPacePanel` |
| `RnpPacePanel.tsx` | "РНП" — дневная динамика темпа звонков/встреч по менеджеру, цветовая индикация относительно плана |
| `SalesComparisonDashboard.tsx` | Сравнение месяц-к-месяцу по воронке: карточки метрик, сравнение воронок, "симулятор гипотез" (что если поднять конверсию/звонки) |
| `ClientDirectoryPanel.tsx` | Каталог контрагентов: поиск, КТП-флаг, назначенный менеджер, счётчик ЦП |
| `ClientCpEditor.tsx` | Редактор ЦП (коммерческих предложений) — по встрече и "без встречи" (standalone), плюс отметка "оплачено" |
| `ClientHistoryModal.tsx` | История контрагента: все встречи/заказы по всем отчётам + редактирование профиля клиента |
| `SupplierRegistryPanel.tsx` | Производная аналитика по поставщикам — когорты по месяцу первого заказа или разбивка по году, с CSV-экспортом |
| `GoszakupContractsPanel.tsx` | Выгрузка публичных контрактов поставщика с goszakup.gov.kz в Excel (скрейпинг, не официальный API) |
| `EnsTruCheckPanel.tsx` | Проверка списка кодов ЕНС ТРУ по справочнику `crm_ens_tru_codes` |
| `AdminOrderCreateModal.tsx` / `AdminOrderEditModal.tsx` | Ручное создание/редактирование подтверждённого заказа админом (вне обычного флоу отчёта менеджера) |
| `PeriodFilterFields.tsx` | Переиспользуемый фильтр периода (пресеты: сегодня/неделя/месяц/N дней/произвольный диапазон) |

`src/PublicEnsTruPage.tsx` — публичная обёртка над `EnsTruCheckPanel` без авторизации, на маршруте `/enstru`.

## Библиотеки (`src/lib/`)

| Файл | Назначение |
|---|---|
| `supabase.ts` | Инициализация клиента Supabase (`getSupabase`/`getSupabaseOptional`/`isSupabaseConfigured`) |
| `crmApi.ts` | Основной слой доступа к данным: типы `FullReport`/`ReportRow`, загрузка/сохранение отчётов, клиентов и т.д. через RPC |
| `kpiMetrics.ts` | **Ядро бизнес-логики.** Классификация типов встреч, построение индекса план↔факт (`buildMeetingEvidenceIndex`), все счётчики КПИ, воронка для дашбордов сравнения, РНП. См. `docs/BUSINESS_LOGIC.md` |
| `staffDept.ts` | Определение отдела сотрудника (`managers`/`diggers`/`admin`) для отчёта — с приоритетом замороженного `staff_dept` |
| `enterpriseLeadsApi.ts` | Все операции с воронкой "Крупный лид": назначение, взятие в работу, итог встречи, статистика конверсии лидорубов |
| `ordersExport.ts` | Excel-экспорт заказов — по записям и сгруппированный по контрагентам (`exportGroupedOrdersToExcel`, без пробелов в числах) |
| `ordersGrouping.ts` | Группировка заказов по контрагенту (используется и на экране, и в экспорте — важно для консистентности "уникальных контрагентов") |
| `commission.ts` | Расчёт комиссии по заказу: тиры 3%/5% или фиксированная сумма, в зависимости от суммы, МРП и флага КТП |
| `clientProfile.ts` | Форматирование/парсинг полей профиля клиента (месяц привлечения, категории) — чистые функции, без I/O |
| `clientCpStats.ts` | Подсчёт статистики ЦП по клиенту |
| `crmClientHistory.ts` | Фильтрация истории контрагента (встречи/заказы) из массива всех отчётов по БИН |
| `supplierRegistry.ts` | Построение строк реестра поставщиков (когорты/по годам) + CSV-экспорт |
| `goszakupContractsApi.ts` / `goszakupParse.ts` | Клиент + HTML-парсер для скрейпинга goszakup.gov.kz |
| `ensTruApi.ts` | Обёртка над RPC `check_ens_tru_codes`/`normalize_ens_tru_code` |
| `managerBlockersApi.ts` | Обёртка над RPC блокеров |
| `managerWorkItemsApi.ts` | Обёртка над RPC work items |
| `periodBounds.ts` | Границы периодов (месяц/квартал/произвольный диапазон), форматирование дат в локальной таймзоне |
| `staffAuth.ts` | Хелперы логин-кода / синтетического email для входа |
| `telegramDailyDigest.ts` | Выбор "лучшего" отчёта менеджера за день для дайджеста (не сама отправка) |
| `telegramEnterpriseLead.ts` | Уведомление в Telegram о новом лиде "Крупный бизнес" — вебхук или Edge Function `telegram-enterprise-lead` |

## Edge Functions (`supabase/functions/`)

| Функция | Назначение | Секреты |
|---|---|---|
| `create-staff` | Создание аккаунта сотрудника (Auth + `profiles`) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STAFF_EMAIL_DOMAIN` |
| `set-staff-password` | Смена пароля сотрудника | те же |
| `revoke-staff-access` | Деактивация сотрудника (бан в Auth + `is_active=false`) | те же |
| `telegram-daily-report` | Ежедневный отчёт в Telegram (полный + отдельно "Итоги дня"), вызывается `pg_cron` | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_CRON_SECRET`, `REPORT_TIMEZONE`, `SUPABASE_SERVICE_ROLE_KEY` |
| `telegram-enterprise-lead` | Уведомление в Telegram о новом лиде "Крупный бизнес" | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` |
| `goszakup-contracts-export` | Прокси-скрейпинг goszakup.gov.kz из прода (rate-limited) | — |

Подробности деплоя и секретов — `docs/DEPLOYMENT.md`.
