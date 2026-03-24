# mtuci app

Приложение состоит из фронтенда (Vite + React + Tailwind) и backend'а на FastAPI, который обращается к PostgreSQL и MinIO для хранения данных и аватаров.

## Быстрый старт

```bash
# установить зависимости фронта
npm install

# создать виртуальное окружение для backend (один раз)
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Настройка окружения

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

Фронтенд:
```bash
npm run dev
```

Backend (из корня проекта):
```bash
source venv/bin/activate
python -m uvicorn app:app --reload --port 8000
```

Или из директории `backend`:
```bash
source venv/bin/activate
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
