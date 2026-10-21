<div align="center">

<img src="docs/design/assets/Brand/app-icon.svg" width="96" height="96" alt="DaFit">

# DaFit

**Приложение для персонального тренера и его клиентов**

Расписание, абонементы, тренировки, питание и прогресс в одном месте: в браузере и прямо в Telegram.

**Русский** · [English](README.en.md)

[![CI](https://github.com/toprudik/Fit/actions/workflows/ci.yml/badge.svg)](https://github.com/toprudik/Fit/actions/workflows/ci.yml)
![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs)
![Supabase](https://img.shields.io/badge/Supabase-Postgres_17-3ECF8E?logo=supabase&logoColor=white)
![Telegram Mini App](https://img.shields.io/badge/Telegram-Mini_App-26A5E4?logo=telegram&logoColor=white)
![Python 3.13](https://img.shields.io/badge/Python-3.13-3776AB?logo=python&logoColor=white)

[Открыть DaFit](https://dafit-web-eight.vercel.app) · [Бот @fitconnection_bot](https://t.me/fitconnection_bot)

</div>

## Что это

Тренер обычно держит клиентов в тетрадке, таблице и переписках: кто когда придёт, кто сколько должен, у кого какой прогресс. DaFit собирает всё это в одно приложение, которым пользуются и тренер, и его клиенты.

Тренер ведёт своих клиентов в DaFit, а клиент видит свои занятия, абонементы и прогресс и сам решает, какие свои данные открыть тренеру. Один человек может быть и тренером, и клиентом: в приложении две зоны, «Тренер» и «Клиент», между ними можно переключаться. Вход только через Telegram.

Сейчас DaFit готовится к закрытой бете, которая стартует 24.11.2026. Название рабочее, репозиторий называется `fit`.

## Возможности

**Для тренера**

- Расписание: слоты, повторы, шаблон недели, групповые занятия, офлайн и онлайн, запись и запросы, отмены и переносы, синхронизация с календарём.
- Абонементы и оплаты: пакеты, ценовая сетка, долг, заморозка, разовые занятия.
- Клиенты: карточки, заметки, анкета клиента, карточки для тех, кто ещё не зашёл в DaFit (потом они переходят к человеку вместе с историей).
- Витрина тренера с QR, ссылка для клиентов и ссылка на пробное занятие.
- Аналитика и финансы, группы и рассылки, помощники и подмена.

**Для клиента**

- Свои занятия, абонементы и напоминания от бота.
- Лог тренировок с упражнениями из wger, шаблонами и рекордами.
- Питание: норма, дневник, поиск по Open Food Facts и штрихкоду.
- Прогресс: замеры, фото «до и после» с размытием лица прямо на устройстве, шаги, вода и сон.
- Серии, значки, челленджи и итоги месяца с карточками для сторис.

**Приватность**

- Всё личное живёт внутри пары «тренер и клиент». Тренер видит только своих клиентов и только то, что клиент ему открыл.
- Админ не видит личные данные клиентов.
- Экспорт своих данных и удаление аккаунта есть в самом приложении.

## На чём сделано

| Часть | Технологии |
|---|---|
| Веб и Telegram Mini App (`apps/web`) | Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, motion |
| Бот (`apps/bot`) | Python 3.13, aiogram 3, работает через вебхук |
| База и вход | Supabase: Postgres с RLS, миграции и тесты pgTAP; вход через Telegram |
| Хостинг | Vercel (веб и бот), уведомления уходят из очереди в базе по pg_cron |

Подробнее о стеке: [ADR 0003](docs/adr/0003-stack-and-runtime.md).

## Устройство репозитория

```
apps/web/     веб-приложение и Telegram Mini App (Next.js)
apps/bot/     Telegram-бот (aiogram)
supabase/     SQL-миграции и pgTAP-тесты
docs/         решения, PRD, архитектура, дизайн, ADR
scripts/      служебные скрипты для CI и разработки
```

## Как запустить локально

Нужен Docker и свой тестовый бот. Создай его в @BotFather (`/newbot`) и впиши токен в `.env.local`, он нужен и вебу, и боту. Боевой @fitconnection_bot локально не подойдёт: контейнер бота не запустится с ним, как и с любым ботом, у которого настроен вебхук (ADR 0002 §5). Если у тестового бота остался вебхук, например после запуска `docker-compose.prod.yml`, открой в браузере `https://api.telegram.org/bot<токен тестового бота>/deleteWebhook` или заведи другого бота.

1. `cp .env.example .env.local` и заполни пустые значения (подсказки есть в комментариях файла).
2. `docker compose up --build`: веб откроется на http://localhost:3000, бот запустится в режиме polling.

### Mini App внутри Telegram

Telegram открывает Mini App только по публичному HTTPS-адресу:

1. `docker compose --profile tunnel up` и скопируй адрес `https://….trycloudflare.com` из логов `tunnel`.
2. В `.env.local` впиши этот адрес в `NEXT_PUBLIC_APP_URL` и `WEBAPP_URL` и перезапусти `docker compose up`.
3. Отправь `/start` своему тестовому боту и нажми **Открыть DaFit** (**Open DaFit**, если Telegram на английском).

### Вход на сайте через Telegram

В @BotFather → твой бот → **Login Widget** добавь адрес сайта и `<адрес>/auth/telegram/callback` в Allowed URLs, а показанные Client ID и Client Secret впиши в `.env.local`.

## Проверки

```bash
cd apps/web && npm run lint && npm run typecheck && npm test && npm run build
cd apps/web && npm run e2e   # после build: Playwright и axe, телефон и десктоп, обе темы
cd apps/bot && uv run ruff check . && uv run ruff format --check . && uv run pytest
```

CI запускает то же самое, а ещё проверки базы, поиск секретов gitleaks и сборку Docker-образов.

### База данных

Схема лежит в `supabase/migrations/`, тесты к ней в `supabase/tests/` (pgTAP: RLS, права на столбцы, триггеры, ограничения). Нужны Docker и Supabase CLI 2.121.0, та же версия, что в CI. Команды запускаются из корня репозитория:

```bash
supabase db start      # локальный Postgres 17, все миграции с нуля
supabase test db       # все pgTAP-тесты
supabase db lint --local --schema public,private --fail-on error   # plpgsql_check
supabase db advisors --local --type all --fail-on warn            # советы по безопасности и скорости
supabase gen types typescript --local > apps/web/src/lib/supabase/database.types.ts
supabase stop          # когда закончил
```

После новой или изменённой миграции `supabase db reset` пересобирает базу из всех миграций. Перегенерированный `database.types.ts` коммить как есть, без форматирования: CI падает, если файл расходится со схемой.

В рабочий проект Supabase миграции попадают только через `main`: когда push в `main` меняет `supabase/migrations/`, workflow `Database deploy` выполняет `supabase db push` и проверки советника. Он читает один секрет репозитория, `SUPABASE_DB_URL`. Рабочую схему руками не правим.

## Деплой

Веб и бот работают на Vercel и выкатываются в продакшен только из `main`. Как устроены окружения, как настроить бота с нуля и как менять секреты, описано в [docs/deployment.md](docs/deployment.md) (на английском).

## Документация

- [CLAUDE.md](CLAUDE.md): правила для агентов, которые пишут код
- [docs/decisions.md](docs/decisions.md): продуктовые решения; [CONTEXT.md](CONTEXT.md): словарь терминов
- [docs/prd/](docs/prd/): что строим в каждой волне; [docs/architecture/](docs/architecture/): модель данных и экраны; [docs/plan.md](docs/plan.md): план до беты 24.11.2026
- [docs/adr/](docs/adr/): архитектурные решения
- [docs/design.md](docs/design.md): дизайн-система и макеты; [docs/design/](docs/design/): токены и шрифты
- [docs/writing.md](docs/writing.md): как мы пишем тексты DaFit
