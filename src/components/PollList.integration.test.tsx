import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PollList } from './PollList';

const { getPolls, getWeatherSnapshot, authState } = vi.hoisted(() => ({
  getPolls: vi.fn(),
  getWeatherSnapshot: vi.fn(),
  authState: {
    currentUser: null as {
      id: string;
      email: string;
      name: string;
      role: 'admin' | 'user';
      username: string;
    } | null,
  },
}));

vi.mock('../api/pollApi', () => ({
  PollApiService: {
    getPolls,
    getWeatherSnapshot,
  },
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: authState.currentUser,
  }),
}));

describe('PollList', () => {
  beforeEach(() => {
    getPolls.mockReset();
    getWeatherSnapshot.mockReset();
    getWeatherSnapshot.mockResolvedValue({
      city: 'Moscow',
      condition: 'Clouds',
      conditionDescription: 'Облачно',
      temperatureC: 10,
      feelsLikeC: 9,
      humidityPercent: 70,
      windSpeedMps: 2,
      observedAt: '2026-03-24T10:00:00+00:00',
      source: 'openweathermap',
      cached: false,
    });
    window.history.replaceState({}, '', '/опросы');
  });

  it('reads filters from query string and requests matching poll page', async () => {
    authState.currentUser = {
      id: 'user-1',
      email: 'user@example.com',
      name: 'Студент',
      role: 'user',
      username: 'student',
    };
    window.history.replaceState(
      {},
      '',
      '/опросы?status=completed&anonymity=public&mine=1&q=кафедра&sortBy=title&sortOrder=desc&page=2'
    );
    getPolls.mockResolvedValue({
      items: [
        {
          id: 'poll-1',
          title: 'Публичный опрос кафедры',
          description: 'Описание',
          type: 'single',
          variants: [
            { id: 'v1', label: 'Да' },
            { id: 'v2', label: 'Нет' },
          ],
          maxSelections: 1,
          isAnonymous: false,
          ownerUserId: 'user-1',
        },
      ],
      total: 7,
    });

    render(
      <PollList
        onViewChange={vi.fn()}
        onPollSelect={vi.fn()}
        onResultsSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getPolls).toHaveBeenCalledWith({
        status: 'completed',
        page: 2,
        limit: 6,
        search: 'кафедра',
        isAnonymous: false,
        ownerUserId: 'user-1',
        sortBy: 'title',
        sortOrder: 'desc',
      });
    });
    expect(screen.getByText('Публичный опрос кафедры')).toBeInTheDocument();
  });

  it('applies search filters and updates the URL state', async () => {
    authState.currentUser = null;
    getPolls.mockResolvedValue({
      items: [],
      total: 0,
    });
    const user = userEvent.setup();

    render(
      <PollList
        onViewChange={vi.fn()}
        onPollSelect={vi.fn()}
        onResultsSelect={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(getPolls).toHaveBeenCalledTimes(1);
    });

    await user.type(screen.getByLabelText('Поиск опросов'), 'математика');
    await user.click(screen.getByRole('button', { name: 'Найти' }));

    await waitFor(() => {
      expect(getPolls).toHaveBeenLastCalledWith({
        status: 'all',
        page: 1,
        limit: 6,
        search: 'математика',
        isAnonymous: undefined,
        ownerUserId: undefined,
        sortBy: 'deadline',
        sortOrder: 'asc',
      });
    });
    expect(window.location.search).toContain('q=%D0%BC%D0%B0%D1%82%D0%B5%D0%BC%D0%B0%D1%82%D0%B8%D0%BA%D0%B0');
  });

  it('shows retry state when poll loading fails', async () => {
    authState.currentUser = null;
    getPolls.mockRejectedValueOnce(new Error('network'));
    getPolls.mockResolvedValueOnce({ items: [], total: 0 });
    const user = userEvent.setup();

    render(
      <PollList
        onViewChange={vi.fn()}
        onPollSelect={vi.fn()}
        onResultsSelect={vi.fn()}
      />
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('Ошибка загрузки опросов');
    await user.click(screen.getByRole('button', { name: 'Попробовать снова' }));

    await waitFor(() => {
      expect(getPolls).toHaveBeenCalledTimes(2);
    });
  });
});
