import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const e2eDbPath = path.join(rootDir, 'backend', 'e2e.sqlite');
const apiBaseUrl = process.env.PLAYWRIGHT_API_BASE_URL || 'http://127.0.0.1:8010';
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const shouldManageServers = process.env.PLAYWRIGHT_EXTERNAL_SERVER !== '1';
process.env.PLAYWRIGHT_API_BASE_URL = apiBaseUrl;
const sharedEnv = {
  USE_SQLITE: '1',
  DATABASE_URL: `sqlite:///${e2eDbPath}`,
  JWT_SECRET: 'e2e-secret',
  ADMIN_SECRET: 'e2e-admin-secret',
  SQLALCHEMY_ECHO: 'false',
  ACCESS_TOKEN_TTL_MINUTES: '30',
  REFRESH_TOKEN_TTL_DAYS: '30',
  MINIO_ENDPOINT: '',
  MINIO_ACCESS_KEY: '',
  MINIO_SECRET_KEY: '',
  MINIO_BUCKET: 'avatars',
  MINIO_PUBLIC_URL: '',
  WEATHER_API_KEY: '',
};

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.e2e.ts'],
  fullyParallel: false,
  reporter: 'list',
  timeout: 45_000,
  use: {
    baseURL: baseUrl,
    trace: 'on-first-retry',
  },
  webServer: shouldManageServers
    ? [
        {
          command: './venv/bin/python -m uvicorn app:app --port 8010 --app-dir backend',
          url: `${apiBaseUrl}/health`,
          reuseExistingServer: false,
          cwd: rootDir,
          env: {
            ...process.env,
            ...sharedEnv,
          },
        },
        {
          command: 'npm run dev -- --host 127.0.0.1 --port 5173',
          url: baseUrl,
          reuseExistingServer: false,
          cwd: rootDir,
          env: {
            ...process.env,
            VITE_API_BASE_URL: apiBaseUrl,
          },
        },
      ]
    : undefined,
});
