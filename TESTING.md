# Тестовая модель и инфраструктура

## Критические пользовательские сценарии

1. Авторизация, выход и восстановление сессии после перезагрузки.
2. Создание опроса, просмотр списка, фильтрация, сортировка и пагинация.
3. Голосование в анонимном и публичном режимах с соблюдением ограничений по типу опроса.
4. Просмотр результатов, включая публичные списки проголосовавших и экспорт CSV.
5. Работа с профилем и загрузкой аватара.
6. Ролевой доступ к административному интерфейсу и операциям управления пользователями.
7. Загрузка, получение и удаление файлов-вложений к опросу.
8. Деградация при ошибках внешнего weather API.

## Бизнес-правила и ограничения

- `admin` может управлять ролями и удалять любые опросы; `user` работает только со своими опросами.
- Для `single`-опроса разрешён ровно один выбор.
- Для `multi`-опроса `maxSelections >= 1` и число выбранных вариантов не превышает лимит.
- Голосовать от имени другого пользователя нельзя.
- Дедлайн должен быть в будущем; закрытый опрос не принимает новые голоса.
- Для создания опроса требуется минимум два варианта.
- Нельзя разжаловать или удалить последнего администратора.
- Поддерживаются только разрешённые MIME-типы файлов.

## Зоны повышенного риска

- JWT access/refresh flow и rotation refresh-сессий.
- RBAC и защита маршрутов на frontend.
- Профиль, avatar upload и object storage интеграция.
- CRUD для опросов с учётом ролей владельца.
- Ошибки внешнего weather API и graceful degradation в UI.

## Реализованные слои тестирования

### Backend

- `backend/tests/unit/test_auth_service.py`
  Покрывает authenticate, issue/refresh/logout токенов, ротацию refresh-сессий и ошибки безопасности.
- `backend/tests/unit/test_weather_service.py`
  Покрывает cache, retry/timeout, rate limit fallback и нормализацию weather payload.
- `backend/tests/integration/*.py`
  Проверяют auth, users, polls, attachments, external weather и core endpoints через FastAPI `TestClient`.

### Frontend

- `src/auth/rbac.unit.test.ts`
  Проверяет матрицу ролей и route guard.
- `src/api/pollApi.integration.test.ts`
  Проверяет login/session persistence, retry после `401`, refresh failure и cache API списка опросов.
- `src/context/AuthContext.integration.test.tsx`
  Проверяет sync с `localStorage` и событием `auth:changed`.
- `src/components/views/LoginView.unit.test.tsx`
  Проверяет валидацию логина/регистрации и обработку ошибок.
- `src/components/PollList.integration.test.tsx`
  Проверяет фильтры, query-state, retry и состояния списка.
- `src/components/views/PollVotingView.unit.test.tsx`
  Проверяет ограничения на файлы и поведение формы голосования.

### E2E

- `e2e/app.e2e.ts`
  Проверяет:
  - login/logout/session restore;
  - route protection по ролям;
  - создание опроса, фильтрацию, пагинацию и деградацию weather API;
  - upload/download/delete вложений через mocked storage endpoints.

## Тестовое окружение и изоляция

- Backend unit/integration используют отдельную SQLite БД и фикстуры из `backend/tests/conftest.py`.
- Внешние зависимости замоканы:
  - MinIO через `FakeMinioClient`;
  - weather adapter через `StubWeatherAdapter`.
- E2E перед каждым тестом сбрасывают БД через `backend/tests/support/reset_db.py`.
- Для Playwright Chromium устанавливается локально, а внешние weather/attachment endpoints подменяются через `page.route(...)`.

## Метрики и правила

- Backend coverage threshold: `65%` глобально по `pytest-cov`.
- Frontend coverage threshold: `65/55%` по критическим модулям в `vitest`.
- Разделение по слоям:
  - быстрые: `test:backend:unit`, `test:frontend:unit`
  - интеграционные: `test:backend:integration`, `test:frontend:integration`
  - длительные: `test:e2e`
- Именование:
  - backend: `test_*.py`
  - frontend: `*.unit.test.ts(x)` и `*.integration.test.ts(x)`
  - e2e: `*.e2e.ts`

## Команды запуска

```bash
npm run test:backend
npm run test:frontend
npm run test:e2e
npm run test:all
```
