# Survey App Backend

Backend API для приложения голосований, написанный на FastAPI с PostgreSQL.

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
DATABASE_URL=postgresql://username:password@localhost:5432/survey_db
```

### 4. Инициализация базы данных

```bash
# Создание миграций
alembic revision --autogenerate -m "Initial migration"

# Применение миграций
alembic upgrade head
```

### 5. Запуск сервера

```bash
# Разработка
uvicorn app:app --reload --port 8000

# Или через npm
npm run dev:backend
```

## API Endpoints

- `GET /` - Информация о сервисе
- `GET /health` - Проверка здоровья
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