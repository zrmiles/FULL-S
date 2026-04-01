import { expect, test, APIRequestContext, Page } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const e2eDbPath = path.join(rootDir, 'backend', 'e2e.sqlite');
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL || 'http://127.0.0.1:8010';
const shouldManageServers = process.env.PLAYWRIGHT_EXTERNAL_SERVER !== '1';
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sharedEnv = {
  ...process.env,
  USE_SQLITE: '1',
  DATABASE_URL: `sqlite:///${e2eDbPath}`,
  JWT_SECRET: 'e2e-secret',
  ADMIN_SECRET: 'e2e-admin-secret',
  SQLALCHEMY_ECHO: 'false',
  ACCESS_TOKEN_TTL_MINUTES: '30',
  REFRESH_TOKEN_TTL_DAYS: '30',
};

function resetDb(): void {
  const result = spawnSync('./venv/bin/python', ['backend/tests/support/reset_db.py'], {
    cwd: rootDir,
    env: sharedEnv,
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to reset e2e database');
  }
}

async function login(page: Page, request: APIRequestContext, username: string, password: string) {
  const response = await request.post(`${apiBaseUrl}/auth/login`, {
    data: { username, password },
  });
  expect(response.ok()).toBeTruthy();

  const payload = await response.json();
  await page.addInitScript((authPayload) => {
    localStorage.setItem('auth:user', JSON.stringify(authPayload.user));
    localStorage.setItem(
      'auth:session',
      JSON.stringify({
        ...authPayload.tokens,
        obtainedAt: Date.now(),
      })
    );
  }, payload);

  await page.goto('/опросы');
  await expect(page.getByRole('button', { name: 'Выйти' })).toBeVisible();
}

test.beforeEach(() => {
  if (shouldManageServers) {
    resetDb();
  }
});

test('supports login, session restore and logout', async ({ page, request }) => {
  await page.route(`${apiBaseUrl}/external/weather`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        city: 'Moscow',
        condition: 'Clouds',
        conditionDescription: 'Облачно',
        temperatureC: 10,
        feelsLikeC: 9,
        humidityPercent: 65,
        windSpeedMps: 3,
        observedAt: '2026-03-24T10:00:00+00:00',
        source: 'openweathermap',
        cached: false,
      }),
    });
  });

  await login(page, request, 'admin', 'Admin123!');
  await expect(page.getByRole('button', { name: 'Новый опрос' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Админ' })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Администратор')).toBeVisible();

  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page.getByLabel('Войти')).toBeVisible();
});

test('enforces route protection for non-admin users', async ({ page, request }) => {
  await login(page, request, 'student', 'Student123!');

  await page.goto('/админ');
  await expect(page).not.toHaveURL(/(%D0%B0%D0%B4%D0%BC%D0%B8%D0%BD|\/админ)/);
  await expect(page.getByRole('button', { name: 'Админ' })).toHaveCount(0);
});

test('covers poll creation, filtering, pagination and external API degradation', async ({ page, request }) => {
  await page.route(`${apiBaseUrl}/external/weather`, async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'Weather unavailable' }),
    });
  });

  await login(page, request, 'admin', 'Admin123!');
  await expect(page.getByText('Внешний сервис погоды временно недоступен')).toBeVisible();

  await page.getByRole('button', { name: 'Новый опрос' }).click();
  await page.getByLabel('Заголовок').fill('E2E новый опрос');
  await page.getByLabel('Описание').fill('Создано автотестом');
  await page.getByRole('button', { name: 'Создать опрос' }).click();
  await expect(page).toHaveURL(/(%D0%BE%D0%BF%D1%80%D0%BE%D1%81%D1%8B|\/опросы)/);
  await expect(page.getByText('E2E новый опрос')).toBeVisible();

  await page.getByLabel('Поиск опросов').fill('E2E новый опрос');
  await page.getByRole('button', { name: 'Найти' }).click();
  await expect(page).toHaveURL(/q=/);
  await expect(page.getByText('E2E новый опрос')).toBeVisible();

  await page.getByLabel('Поиск опросов').fill('');
  await page.getByRole('button', { name: 'Найти' }).click();
  await page.getByRole('button', { name: 'Все' }).click();
  await expect(page.getByRole('button', { name: 'Далее' })).toBeEnabled();
  await page.getByRole('button', { name: 'Далее' }).click();
  await expect(page.getByText(/Показано/)).toBeVisible();
});

test('runs attachment upload and download scenario with mocked storage endpoints', async ({ page, request }) => {
  const attachments: Array<{
    id: string;
    pollId: string;
    originalName: string;
    contentType: string;
    sizeBytes: number;
    uploaderUserId: string;
    createdAt: string;
    downloadUrl: string;
  }> = [];

  await page.route(`${apiBaseUrl}/external/weather`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        city: 'Moscow',
        condition: 'Clouds',
        conditionDescription: 'Облачно',
        temperatureC: 10,
        feelsLikeC: 9,
        humidityPercent: 65,
        windSpeedMps: 3,
        observedAt: '2026-03-24T10:00:00+00:00',
        source: 'openweathermap',
        cached: false,
      }),
    });
  });

  await page.route(new RegExp(`${escapeRegExp(apiBaseUrl)}/polls/.*/attachments$`), async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: attachments }),
      });
      return;
    }

    attachments.splice(0, attachments.length, {
      id: 'attachment-1',
      pollId: 'poll-1',
      originalName: 'notes.txt',
      contentType: 'text/plain',
      sizeBytes: 11,
      uploaderUserId: 'admin-id',
      createdAt: '2026-03-24T10:00:00+00:00',
      downloadUrl: '/polls/poll-1/attachments/attachment-1/download',
    });
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(attachments[0]),
    });
  });

  await page.route(new RegExp(`${escapeRegExp(apiBaseUrl)}/polls/.*/attachments/attachment-1$`), async (route) => {
    attachments.splice(0, attachments.length);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok' }),
    });
  });

  await login(page, request, 'admin', 'Admin123!');
  const pollCard = page.locator('article').filter({ hasText: 'Публичный опрос кафедры' });
  await pollCard.getByRole('button', { name: 'Проголосовать' }).click();
  await expect(page.getByText('Вложения к опросу')).toBeVisible();

  await page.getByLabel('Выбрать файл вложения').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello world'),
  });
  await page.getByRole('button', { name: 'Прикрепить файл' }).click();
  await expect(page.getByText('notes.txt')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Скачать' })).toHaveAttribute(
    'href',
    /^(https?:\/\/[^/]+)?\/api\/polls\/.*\/download$/
  );

  await page.getByRole('button', { name: 'Удалить' }).click();
  await page.getByRole('button', { name: 'Удалить' }).nth(1).click();
  await expect(page.getByText('notes.txt')).toHaveCount(0);
});
