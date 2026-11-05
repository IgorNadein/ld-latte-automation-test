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

**Основной маршрут с 5 ноября 2026:** Telegram → `https://n8n-ldlatte.aishka.su/webhook/...` → **Telegram Trigger n8n 2.46.6** → HTTP-запрос к публичному read-only каталогу `services` в Supabase → `Compose reply` → Telegram Bot API через HTTP Request (`sendMessage`, `editMessageText`) и штатный узел Telegram `answerCallbackQuery`. n8n получает список услуг заново для `/start`, нажатия и возврата в меню. Ни количество, ни названия услуг в workflow не закодированы. Временные сетевые сбои Supabase обрабатываются повторными попытками (3 запроса) и понятным сообщением пользователю, вместо ложного объявления об отсутствии услуг. Названия услуг экранируются при вставке в HTML-сообщения.

**Исправление динамической клавиатуры:** штатный Telegram-узел n8n 2.46.6 не раскрывает динамически вычисляемый объект `inlineKeyboard` типа fixedCollection: в реальных прогонах отправлялся текст без кнопок (`reply_markup` отсутствовал). Даже статическое `replyMarkup=inlineKeyboard` не помогло, поскольку `getNodeParameter('inlineKeyboard')` возвращал пустой объект. Поэтому Send/Edit реализованы через встроенный **HTTP Request** с целиком динамическим JSON-телом `reply_markup.inline_keyboard`, как рекомендуют n8n workflow examples. Это сохраняет главные требования: Telegram Trigger, данные из Supabase, динамический набор кнопок по ID, callback и обновление без изменений workflow. Автотесты проверяют формат HTTP-тел для 0/2/5/9 услуг, а изолированный настоящий n8n 2.46.6 выполнил HTTP Request sendMessage/editMessageText к локальному тестовому приёмнику и подтвердил JSON с inline_keyboard.

8 узлов workflow: Telegram Trigger, Normalize update, Get services, Compose reply, Was callback?, Acknowledge callback, Send Telegram menu, Edit Telegram menu. Telegram Credential назначен Telegram Trigger и Acknowledge callback в работающем экземпляре n8n; два HTTP Request узла используют `${TELEGRAM_BOT_TOKEN}` из окружения и никогда не содержат literal token в публичном JSON. При исполнении Telegram Bot API требует токен в URL: в error traces URL может оказаться раскрытым, поэтому доступ к логам строго ограничен.

**Проверено:** импорт/экспорт JSON в отдельный n8n 2.46.6, реальные запуски движка на каталогах 0, 2, 5, 9 услуг, переименование, достижение Telegram API sendMessage через опубликованный HTTPS webhook с секретным заголовком. `getWebhookInfo` через Bot API подтверждает, что Telegram направлен на n8n, pending_update_count=0 и last_error_message отсутствует на момент проверки. Проверка через синтетический update использовала заведомо несуществующий chat ID, поэтому Telegram ожидаемо возвратил Bad Request на отправке; **это не заменяет финальный клик `/start` в настоящем чате**.

Ранее опубликованная Supabase Edge Function сохранена как резервная реализация и health-check, но **не получает Telegram webhook**. Она реализует тот же сценарий; никакой параллельной обработки одного и того же обновления нет. Для production предпочтительнее управляемый VPS/контейнер с перезапуском n8n, отдельной БД, мониторингом и резервным копированием. Текущий n8n живёт в Termux и может остановиться при перезапуске телефона или выгрузке Android.

## Безопасность

- В действующем n8n токен Telegram хранится в зашифрованной Telegram Credential для Trigger/Callback и в защищённом окружении для динамических HTTP Request; в Supabase Vault сохраняется резервный токен/секрет для неактивной Edge Function. Ни один секрет не включён в исходники или публичный репозиторий.
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
5. Поднять n8n с HTTPS webhook URL (`N8N_WEBHOOK_URL`), импортировать `n8n/dynamic-services.workflow.json`, указать `SUPABASE_URL` и `SUPABASE_ANON_KEY` (публичный).
6. Создать **Telegram Credential** в n8n, назначить узлам Telegram Trigger и Acknowledge callback; определить секретную переменную окружения `TELEGRAM_BOT_TOKEN` для двух HTTP Request. Опубликовать workflow. Telegram Trigger зарегистрирует единственный webhook у Telegram. Не публиковать n8n Execution history и error URLs, содержащие подставленный токен.
7. Проверить регистрацию пользователей, прямые запросы под разными JWT, телефон и 2/5/9 активных услуг.

## Известные особенности

Email-подтверждение для новых пользователей зависит от redirect URL в настройках Supabase Auth, их нужно направить на публичный сайт, прежде чем передать ссылку работодателю. Security Advisor рекомендует включить Leaked Password Protection — дополнительная настройка Auth. Основной Telegram webhook сейчас у n8n. Ошибки редактора при тестировании могут перерегистрировать webhook на test URL; для проверки production не нажимайте «Listen for test event» на живом боте. Для тестов параллельно используйте второго бота. Ретрай Telegram при редких сетевых сбоях теоретически может повторно отправить сообщение: дедупликация update_id в Edge не реализована.


## Интерфейс диалога — редактирование вместо накопления сообщений

Обработчик кнопок использует Telegram `editMessageText` по исходному `message_id`.
Нажатие на услугу заменяет **само меню** подтверждением выбора с кнопкой возврата; возврат редактирует это же сообщение обратно в актуальный каталог после нового SQL-запроса. Это предотвращает появление новой пары сообщений при каждом нажатии. **Новая команда `/start` по-прежнему создаёт новое сообщение**, а уже существующие сообщения в истории Telegram автоматически не удаляются — бот не удаляет пользовательскую переписку.
В n8n экспортируемый workflow тоже переключается между `sendMessage` и `editMessageText` по `messageId` из исходного callback.
