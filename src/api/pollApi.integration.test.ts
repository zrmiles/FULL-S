import { beforeEach, describe, expect, it, vi } from 'vitest';

const jsonResponse = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });

const sessionPayload = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  tokenType: 'bearer',
  accessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 3600,
  obtainedAt: Date.now(),
};

const authResponse = {
  user: {
    id: 'user-1',
    email: 'user@example.com',
    name: 'Пользователь',
    role: 'user' as const,
    username: 'student',
    avatarUrl: null,
  },
  tokens: {
    accessToken: 'next-access',
    refreshToken: 'next-refresh',
    tokenType: 'bearer',
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 3600,
  },
};

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
});

describe('pollApi', () => {
  it('stores session and user after login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(authResponse));
    vi.stubGlobal('fetch', fetchMock);

    const { AuthApi } = await import('./pollApi');
    const user = await AuthApi.login('student', 'Student123!');

    expect(user.username).toBe('student');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/auth/login',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(JSON.parse(localStorage.getItem('auth:user') ?? '{}').id).toBe('user-1');
    expect(JSON.parse(localStorage.getItem('auth:session') ?? '{}').refreshToken).toBe('next-refresh');
  });

  it('refreshes the session and retries a protected request after 401', async () => {
    localStorage.setItem('auth:session', JSON.stringify(sessionPayload));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Token expired' }, 401))
      .mockResolvedValueOnce(jsonResponse(authResponse))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'user-1',
          email: 'user@example.com',
          name: 'Пользователь',
          role: 'user',
          username: 'student',
          avatarUrl: null,
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { AuthApi } = await import('./pollApi');
    const profile = await AuthApi.getProfile();

    expect(profile.id).toBe('user-1');
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/auth/refresh',
      expect.objectContaining({
        method: 'POST',
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      'http://localhost:8000/me',
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    );
    expect(JSON.parse(localStorage.getItem('auth:session') ?? '{}').accessToken).toBe('next-access');
  });

  it('clears local auth state when refresh fails', async () => {
    localStorage.setItem('auth:session', JSON.stringify(sessionPayload));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ detail: 'Token expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Refresh token invalid' }, 401));
    vi.stubGlobal('fetch', fetchMock);

    const { AuthApi } = await import('./pollApi');

    await expect(AuthApi.getProfile()).rejects.toThrow('Token expired');
    expect(localStorage.getItem('auth:session')).toBeNull();
    expect(localStorage.getItem('auth:user')).toBeNull();
  });

  it('caches poll list responses for identical queries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'poll-1',
            title: 'Опрос',
            description: 'Описание',
            type: 'single',
            variants: [
              { id: 'v1', label: 'Да' },
              { id: 'v2', label: 'Нет' },
            ],
            maxSelections: 1,
            isAnonymous: true,
            ownerUserId: 'user-1',
          },
        ],
        total: 1,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const { PollApiService } = await import('./pollApi');
    const first = await PollApiService.getPolls({ search: 'математика', page: 1, limit: 6 });
    const second = await PollApiService.getPolls({ search: 'математика', page: 1, limit: 6 });

    expect(first.total).toBe(1);
    expect(second.items[0].title).toBe('Опрос');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
