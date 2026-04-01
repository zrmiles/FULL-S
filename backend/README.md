# Survey App Backend

Backend API для приложения голосований, написанный на FastAPI с PostgreSQL.

## Docker

Для backend добавлен production-ready образ [`backend/Dockerfile`](./Dockerfile):

```bash
docker build -f backend/Dockerfile -t survey-backend .
docker run --rm -p 8000:8000 --env-file .env survey-backend
```

Отдельный bootstrap схемы для compose/init-container находится в [`backend/bootstrap.py`](./bootstrap.py) и используется сервисом `backend-migrate`.

## Установка и запуск

### 1. Установка зависимостей

```bash
pip install -r requirements.txt
```

### 2. Настройка PostgreSQL

1. Установите PostgreSQL
2. Создайте базу данных:
```sql
CREATE DATABASE survey_db;
```

3. Создайте пользователя (опционально):
```sql
CREATE USER survey_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE survey_db TO survey_user;
```

### 3. Настройка переменных окружения

Скопируйте `env.example` в `.env` и настройте подключение к БД:

```bash
cp env.example .env
```

Отредактируйте `.env`:
```
DATABASE_URL=postgresql+psycopg://username:password@localhost:5432/survey_db
```

### 4. Инициализация базы данных

```bash
# Runtime bootstrap схемы
python bootstrap.py
```

### 5. Запуск сервера

```bash
# Разработка из директории backend
source ../venv/bin/activate
uvicorn app:app --reload --port 8000

# Или из корня проекта
source venv/bin/activate
uvicorn app:app --reload --port 8000 --app-dir backend

# Или через npm из корня
npm run dev:backend
```

## API Endpoints

- `GET /` - Информация о сервисе
- `GET /health` - Readiness backend (БД + object storage)
- `GET /robots.txt` - Правила обхода для поисковых роботов
- `GET /sitemap.xml` - Sitemap для индексируемых маршрутов
- `GET /external/weather` - Нормализованные внешние данные погоды (OpenWeatherMap)
- `GET /polls` - Список всех опросов
- `POST /polls` - Создание нового опроса
- `GET /polls/{poll_id}` - Получение опроса по ID
- `POST /polls/{poll_id}/vote` - Голосование
- `GET /polls/{poll_id}/results` - Результаты голосования

## Структура базы данных

### Таблица `polls`
- `id` - Уникальный идентификатор
- `title` - Заголовок опроса
- `description` - Описание
- `deadline_iso` - Дедлайн
- `type` - Тип опроса ('single' или 'multi')
- `max_selections` - Максимальное количество выборов
- `created_at` - Дата создания

### Таблица `poll_variants`
- `id` - Уникальный идентификатор
- `poll_id` - Ссылка на опрос
- `label` - Текст варианта
- `created_at` - Дата создания

### Таблица `votes`
- `id` - Уникальный идентификатор
- `poll_id` - Ссылка на опрос
- `variant_id` - Ссылка на вариант
- `user_id` - Идентификатор пользователя
- `created_at` - Дата голосования

## Особенности

- **Анонимность**: Система не хранит связь между пользователем и его выбором
- **Уникальность**: Один пользователь может проголосовать только один раз в опросе
- **Гибкость**: Поддержка одиночного и множественного выбора
- **Персистентность**: Все данные сохраняются в PostgreSQL
- **Внешняя интеграция**: Адаптер к OpenWeatherMap на сервере (timeout/retry/rate-limit/cache)
