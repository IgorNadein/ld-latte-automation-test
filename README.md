# LD LATTE — Automation Test Submission

Тестовое задание на позицию «Технический специалист по автоматизации бизнес-процессов» (5 ноября 2026). Все данные — демонстрационные.

## Состав решения

| Задание | Реализация | Основные файлы |
|---|---|---|
| 1 — Telegram / n8n | Импортируемый n8n workflow: /start, динамические inline-кнопки, callback по ID, нулевой набор услуг | `n8n/dynamic-services.workflow.json`, `supabase/schema.sql`, `supabase/demo-services.sql` |
| 2 — Instagram | Схема архитектуры, роли и OAuth, таблица метрик и ограничений, проверки, вопросы | `docs/INSTAGRAM_INTEGRATION_PLAN.md` |
| 3 — Supabase web app | React/Vite/TypeScript, Supabase Auth + PostgreSQL, RLS, список/поиск/фильтр/редактирование, адаптивный дизайн | `app/`, `supabase/schema.sql` |

> Доступы LD LATTE и реальные данные сотрудников не используются.

## Быстрый запуск Supabase + веб-приложения

1. Создайте Supabase project (Free подходит) с включённым Auth → Providers → Email.
2. В SQL Editor выполните `supabase/schema.sql`. В нём таблицы `automation_requests`, `services` и policies.
3. В Supabase → Project Settings → API (или Connect) найдите **Project URL** и **anon/publishable key** (никогда не `service_role`).
4. Скопируйте `.env.example` в `app/.env` (файл находится в корне репозитория, но переменные нужно разместить именно в `app/.env`).
5. В каталоге `app` выполните `npm install` и `npm run dev`. Откройте адрес из консоли. Для production: `npm run build`, затем разместите папку `app/dist` на любом HTTPS static-hosting.
6. Для email-confirmation в Supabase Auth → URL Configuration добавьте ваш реальный URL, включая локальный preview при необходимости. На демо можно включить/отключить подтверждение email.
7. Зарегистрируйте двух разных тестовых пользователей и выполните `docs/TEST_PLAN.md`.

### RLS: проверка без доверия к UI

- `SELECT` только свои строки по `owner_id=auth.uid()`.
- `INSERT` только от собственного имени; `owner_id` по умолчанию заполняется БД.
- `UPDATE` только своих строк; сменить владельца нельзя из-за `WITH CHECK`.
- `DELETE` запрещён (нет policy).
- Данные одного пользователя недоступны другому даже при прямом вызове PostgREST.
- Нет секретов в фронтенде: Supabase anon/publishable key по проекту является публичным, безопасность — на RLS.

## Telegram / n8n

1. Создайте отдельного **тестового** Telegram-бота через BotFather; не используйте рабочие ключи.
2. Используйте n8n с публичным HTTPS webhook URL, корректной базовой конфигурацией домена.
3. Настройте переменные окружения n8n: `TELEGRAM_BOT_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`. Экспорт не содержит значений этих переменных.
4. В тех инсталляциях n8n, где чтение переменных окружения внутри expressions запрещено, разрешите его только для тестовой инсталляции (`N8N_BLOCK_ENV_ACCESS_IN_NODE=false`) или замените ссылки на `$env.*` на защищённые Credentials (не экспортируя секреты). В production предпочтительнее credentials.
5. Import from File: `n8n/dynamic-services.workflow.json`.
6. Выберите Telegram Trigger → credentials → bot token. Telegram может поддерживать только один активный webhook/trigger на бота.
7. Активируйте workflow. Проверяйте `/start`, нажатия кнопок и изменения таблицы. SQL-кейсы для 2/5/9 услуг: `supabase/demo-services.sql`.
8. **Важно:** токен Telegram участвует в URL HTTP Request. Не выкладывайте n8n execution history, скриншоты с resolved URL или логи. Для демонстрации создайте выделенного тестового бота и затем перевыпустите токен при необходимости.

### Почему кнопки действительно динамические

Telegram Trigger получает updates. Code нормализует `/start` или `callback_query`. HTTP Request **при каждом событии** читает таблицу `services` через Supabase REST. Code строит `inline_keyboard` на основе текущих активных записей. Кнопки содержат только ID, а имя находится заново по ID из базы — поэтому переименование и деактивация работают без изменения workflow.

SQL data checks: имена вымышленные. Добавление, переименование, отключение сервисов выполняет администратор в SQL Editor. Анонимный доступ к каталогу только на чтение.

## Instagram

Читайте `docs/INSTAGRAM_INTEGRATION_PLAN.md` и откройте диаграмму Mermaid на GitHub. Обязательная интеграция на реальных аккаунтах **не требуется** условиями тестового задания.

## AI-инструменты и проверка

Использовались AI-инструменты для чернового проектирования архитектуры, генерации кода UI, документации и тестовых сценариев. Ответственные места проверяются отдельно: компиляция TypeScript, корректность RLS, отсутствие секретов, idempotency во время формы, обработка ошибок. Пожалуйста, см. `docs/TEST_PLAN.md` для точного статуса каждой проверки.

## Что передать работодателю

- GitHub repository URL: ссылка на этот репозиторий.
- Working app URL: только после подключения живого Supabase project и размещения `app/dist`.
- Краткая инструкция: текущий README.
- AI use / limitations: `docs/TEST_PLAN.md`.

## Ограничения на момент первичной сборки

Проект Supabase, bot token и н8n credentials не включены в исходники. Поэтому без соответствующих тестовых подключений нельзя заявлять успешные end-to-end проверки или доступность удалённого приложения. Инструкция позволяет выполнить их без использования корпоративных аккаунтов.
