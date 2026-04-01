# mtuci app

Приложение состоит из фронтенда (Vite + React + Tailwind) и backend'а на FastAPI, который обращается к PostgreSQL и MinIO для хранения данных и аватаров.

## Контейнеризация

В репозиторий добавлена воспроизводимая контейнерная схема:

- `frontend`: отдельный контейнер со сборкой и раздачей клиентского SPA;
- `gateway` на Nginx: единая точка входа, проксирует `/api` на FastAPI и web-трафик на frontend;
- `backend`: FastAPI/uvicorn;
- `backend-migrate`: одноразовый bootstrap схемы БД перед запуском API;
- `backend-seed`: одноразовая инициализация стартовых данных;
- `postgres`: основная БД;
- `minio` + `minio-init`: объектное хранилище и инициализация bucket.

Подробная схема взаимодействия контейнеров и порядок запуска описаны в [docs/container-architecture.md](./docs/container-architecture.md).

### Быстрый старт через Docker Compose

```bash
cp .env.example .env
docker compose up -d --build
```

После старта сервисы доступны по адресам:

- приложение: `http://localhost:8080`
- backend API через gateway: `http://localhost:8080/api`
- MinIO API: `http://localhost:9000`
- MinIO Console: `http://localhost:9001`

Полезные команды:

```bash
docker compose ps
docker compose logs -f
docker compose down
```

Важно:

- секреты и локальные env-файлы не должны попадать в git; используйте только `.env.example` как шаблон;
- для production поменяйте `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`, `JWT_SECRET`, при необходимости `MINIO_PUBLIC_URL` и `PUBLIC_BASE_URL`;
- readiness backend завязан на доступность БД и объектного хранилища.

## Быстрый старт

```bash
# установить зависимости фронта
npm install

# создать виртуальное окружение в корне проекта (один раз)
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

## Настройка окружения

### Для Docker Compose

1. Создайте `.env` из корневого шаблона:
   ```bash
   cp .env.example .env
   ```
2. Заполните секреты и при необходимости скорректируйте порты, `PUBLIC_BASE_URL`, `MINIO_PUBLIC_URL`, `WEATHER_API_KEY`.

### Для локального запуска без Docker

1. Создайте файл `backend/.env` на основе `backend/env.example`:
   ```bash
   cp backend/env.example backend/.env
   ```
   Внутри задайте URL базы, а также параметры MinIO (`MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_PUBLIC_URL`, `MINIO_USE_SSL`), URL фронтенда для sitemap (`PUBLIC_BASE_URL`) и ключ внешнего API погоды (`WEATHER_API_KEY`). Для локального окружения можно оставить значения по умолчанию, кроме `WEATHER_API_KEY`.

2. Запустите MinIO вручную (без Docker). Проще всего установить официальный бинарь:
   ```bash
   brew install minio/stable/minio minio/stable/mc
   ```
   Затем поднимите сервер (в отдельном терминале):
   ```bash
   MINIO_ROOT_USER=minioadmin \
   MINIO_ROOT_PASSWORD=minioadmin \
   minio server ~/minio-data --console-address ":9090"
   ```
   Отдельно настройте клиент `mc`, чтобы создать бакет и сделать его публичным на чтение:
   ```bash
   mc alias set local http://localhost:9000 minioadmin minioadmin
   mc mb --ignore-existing local/avatars
   mc anonymous set download local/avatars
   ```
   Если меняете логин/пароль/имя бакета, не забудьте прописать те же значения в `.env`.

3. Проверьте, что backend видит переменные `MINIO_*` (особенно `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`, `MINIO_PUBLIC_URL`, `MINIO_USE_SSL`). Маршрут `/me/avatar` возвращает `503`, если объектное хранилище не настроено.

## Запуск

### Контейнерный запуск

```bash
docker compose up -d --build
```

### Локальный запуск без Docker

Фронтенд:
```bash
npm run dev
```

Backend (из корня проекта):
```bash
source venv/bin/activate
python -m uvicorn app:app --reload --port 8000 --app-dir backend
```

Или из директории `backend`:
```bash
cd backend
source ../venv/bin/activate
python -m uvicorn app:app --reload --port 8000
```

Для параллельного запуска фронта и API используйте `npm run dev:all` из корня (скрипт поднимет Vite и uvicorn).

## Как работает загрузка аватаров

- В профиле пользователь выбирает файл, мы обрезаем его в браузере (`react-easy-crop`) и отправляем на `/me/avatar`.
- Backend (см. `backend/routers/users.py` и `backend/runtime.py`) проверяет тип файла, читает поток и загружает объект в MinIO (`put_object`), формируя путь `<userId>/<uuid>.jpg|png`.
- Ссылка на объект (`MINIO_PUBLIC_URL/<bucket>/<object>`) сохраняется в БД, поэтому UI и отчёты сразу видят обновлённый аватар.

Чтобы остановить MinIO, завершите процесс `minio server` (Ctrl+C) и по необходимости удалите каталог `~/minio-data`.

## RBAC (Лабораторная №1)

В проект добавлена ролевая модель с принципом `deny by default` на backend.

Матрица ролей и прав:

| Роль | Разрешения |
| --- | --- |
| `admin` | создание опросов, голосование, удаление любых/своих опросов, назначение владельца при создании, просмотр пользователей, управление ролями |
| `user` | создание опросов, голосование, удаление только своих опросов, работа с собственным профилем |

Ключевые ограничения:

- Все защищённые операции проверяют `X-User-Id` и права через RBAC-guard в `backend/dependencies.py` + `backend/authz.py`.
- При создании опроса `owner_user_id` ставится из `current_user.id` (если роль не позволяет назначать другого владельца).
- Голосование разрешено только от имени текущего пользователя.
- Endpoint управления ролями только для админа: `PATCH /admin/users/{user_id}/role`.

Frontend также учитывает роли:

- скрывает недоступные действия (например, удаление чужих опросов);
- защищает приватные и ролевые экраны (`organizer`, `profile`, `admin`).

## SEO и внешние интеграции

- На backend доступны:
  - `GET /robots.txt`
  - `GET /sitemap.xml`
  - `GET /external/weather` (интеграция OpenWeatherMap через server-side adapter, с retry, timeout, rate limit и cache)
- На frontend добавлены динамические `title/description/canonical`, OpenGraph/Twitter meta и JSON-LD.
- Матрица индексируемых/закрытых страниц находится в файле `SEO_SCOPE.md`.

## Комплексное тестирование

В проект добавлена воспроизводимая тестовая инфраструктура для backend, frontend и E2E.

Основные команды:

```bash
# backend unit + integration
npm run test:backend

# frontend unit + integration
npm run test:frontend

# браузерные E2E-сценарии
npm run test:e2e

# полный прогон
npm run test:all
```

Подробная тестовая модель, список критических сценариев, правила именования, thresholds покрытия и описание моков вынесены в [TESTING.md](./TESTING.md).

## CI/CD

Workflow [`.github/workflows/ci-cd.yml`](./.github/workflows/ci-cd.yml) выполняет:

- линтеры (`ruff`, `tsc --noEmit`);
- backend/frontend тесты;
- smoke-подъём контейнерного стека и Playwright E2E поверх `docker compose`;
- публикацию образов `backend`, `frontend`, `gateway` в GHCR при `push` в `main`;
- автоматический deploy по SSH после успешных проверок, если заданы `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`, `DEPLOY_PATH`.

Для включения deploy в GitHub нужно добавить secrets:

- `DEPLOY_HOST` — адрес сервера;
- `DEPLOY_USER` — SSH-пользователь;
- `DEPLOY_SSH_KEY` — приватный SSH-ключ для доступа к серверу;
- `DEPLOY_PATH` — путь до каталога проекта на сервере.
