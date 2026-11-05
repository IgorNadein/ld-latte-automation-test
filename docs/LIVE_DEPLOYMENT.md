# LD LATTE — живая демонстрация

Обновлено: 5 ноября 2026 года. Только тестовые данные.

## Публичные адреса

- Работающее React-приложение: https://igornadein.github.io/ld-latte-automation-test/
- Демо-бот Telegram: https://t.me/nadein_crm_bot
- Health-check Telegram: https://fmyoflhkaspsjvtqvkzc.supabase.co/functions/v1/ld-latte-telegram
- База Supabase: проект LD LATTE Automation Demo, регион Frankfurt.
- Профессиональный план Instagram: [PDF](LD_LATTE_Instagram_Integration_Plan.pdf).
- Исходник n8n: [workflow JSON](../n8n/dynamic-services.workflow.json).
- Схема n8n: [визуальный workflow](n8n-workflow.svg).

## Как устроена живая демонстрация

**Прозрачность:** у Telegram может быть только один активный webhook. Чтобы бот был доступен постоянно, его webhook сейчас обрабатывает Supabase Edge Function. Она реализует тот же динамический сценарий, что и экспорт n8n: /start заново считывает актуальный список услуг из PostgreSQL, выводит inline-кнопки, по callback ID находит услугу, подтверждает её название, предлагает кнопку «Вернуться к списку услуг» и учитывает отключение или переименование. Возврат также заново читает список услуг из базы. Это отдельный runtime, не запущенный n8n.

Для самого задания предоставлен настоящий n8n workflow из семи узлов. Он успешно импортирован и повторно экспортирован в n8n 2.46.6 в независимом GitHub Actions, а его логика проверена на 2/5/9 активных услугах, переименовании и callback. Для выполнения именно через n8n нужно импортировать JSON в своё окружение n8n, настроить Telegram Trigger credentials, переменные Supabase и Telegram и переключить Telegram webhook на него.

## Безопасность

- Токен Telegram и секрет проверки webhook хранятся зашифрованными в Supabase Vault. Ни один секрет не включён в исходники или публичный репозиторий.
- Endpoint принимает webhook только при правильном заголовке X-Telegram-Bot-Api-Secret-Token. Неверный заголовок возвращает HTTP 403.
- Веб-клиент использует только публичный ключ Supabase; авторизация и права на заявки защищены RLS в PostgreSQL.
- Нельзя прочитать чужую заявку, изменить чужую, подменить владельца, создать заявку сразу со статусом «Завершена».
- После проверки работодателем токен тестового Telegram-бота необходимо перевыпустить.

## Сквозные проверки на настоящем Supabase

Созданы и подтверждены две тестовые учётные записи. Выполнены живые API-проверки аутентификации, создания и изменения статуса, серверного owner_id, отсутствия доступа к чужим заявкам при SELECT и UPDATE, защиты INSERT, сохранности данных, доступности каталога из 9 услуг.

Chromium дополнительно проверил публичный сайт с настоящими Supabase Auth и PostgreSQL: вход, редактирование, сохранение изменений после перезагрузки, работу на экранах 1280 и 360 px. Скриншоты: [десктоп](screenshots/live-dashboard-desktop.png) и [телефон](screenshots/live-dashboard-mobile.png). Тестовые email-адреса на скриншотах скрыты.

Оставлены три демонстрационные заявки — «Интеграция», «Бот», «Отчёт» с тремя разными статусами.

## Независимые GitHub Actions

- ci.yml: TypeScript/Vite build; 12 групп тестов меню; 8 проверок структуры SQL; 11 браузерных сценариев с mock API.
- postgres-rls.yml: реальные RLS-политики в PostgreSQL 16 с двумя разными пользователями.
- n8n-import.yml: реальный n8n 2.46.6, импорт и экспорт workflow.
- deploy-pages.yml: отдельная публикация с live Supabase, не имитацией данных.

## Воспроизведение

1. Создать Supabase-проект, применить supabase/schema.sql.
2. Заполнить app/.env из app/.env.example URL проекта и publishable key; не указывать service_role.
3. Собрать фронтенд командой npm ci && npm run build в app/.
4. Настроить GitHub Pages из GitHub Actions, repo variable LD_LATTE_SUPABASE_URL и repo secret LD_LATTE_SUPABASE_ANON_KEY. Запустить deploy-pages.yml.
5. Для демо-бота: Supabase Vault для токена и webhook secret; Supabase Edge Function из supabase/functions/telegram-bot/index.ts с verify_jwt=false и собственной проверкой Telegram secret header; Telegram Bot API setWebhook.
6. Для запуска исключительно на n8n импортировать n8n/dynamic-services.workflow.json и создать тестовые Telegram credentials, назначить SUPABASE_URL, SUPABASE_ANON_KEY, TELEGRAM_BOT_TOKEN, активировать Trigger и переключить webhook.
7. Проверить регистрацию пользователей, прямые запросы под разными JWT, телефон и 2/5/9 активных услуг.

## Известные особенности

Email-подтверждение для новых пользователей зависит от redirect URL в настройках Supabase Auth, их нужно направить на публичный сайт, прежде чем передать ссылку работодателю. Security Advisor рекомендует включить Leaked Password Protection — дополнительная настройка Auth. Эта живая Telegram-демонстрация обрабатывает обновления через Edge, а n8n поставляется как отдельный, проверенный CI workflow. Ретрай Telegram при редких сетевых сбоях теоретически может повторно отправить сообщение: дедупликация update_id в Edge не реализована.


## Интерфейс диалога — редактирование вместо накопления сообщений

Обработчик кнопок использует Telegram `editMessageText` по исходному `message_id`.
Нажатие на услугу заменяет **само меню** подтверждением выбора с кнопкой возврата; возврат редактирует это же сообщение обратно в актуальный каталог после нового SQL-запроса. Это предотвращает появление новой пары сообщений при каждом нажатии. **Новая команда `/start` по-прежнему создаёт новое сообщение**, а уже существующие сообщения в истории Telegram автоматически не удаляются — бот не удаляет пользовательскую переписку.
В n8n экспортируемый workflow тоже переключается между `sendMessage` и `editMessageText` по `messageId` из исходного callback.
