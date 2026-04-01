import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AuthApi, User } from '../api/pollApi';
import { useAuth } from './AuthContext';
import { renderWithProviders } from '../test/renderWithProviders';

function Harness(): JSX.Element {
  const { user, login, logout } = useAuth();

  return (
    <div>
      <span data-testid="current-user">{user?.name ?? 'Гость'}</span>
      <button type="button" onClick={() => void login('student', 'Student123!')}>
        Войти
      </button>
      <button type="button" onClick={() => void logout()}>
        Выйти
      </button>
    </div>
  );
}

const mockUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Студент',
  role: 'user',
  username: 'student',
  avatarUrl: null,
};

describe('AuthContext', () => {
  it('updates context and persisted user after login', async () => {
    vi.spyOn(AuthApi, 'login').mockResolvedValue(mockUser);
    const user = userEvent.setup();

    renderWithProviders(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => {
      expect(screen.getByTestId('current-user')).toHaveTextContent('Студент');
    });
    expect(JSON.parse(localStorage.getItem('auth:user') ?? '{}').id).toBe('user-1');
  });

  it('syncs state from auth:changed events', async () => {
    localStorage.setItem('auth:user', JSON.stringify(mockUser));

    renderWithProviders(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId('current-user')).toHaveTextContent('Студент');
    });

    localStorage.setItem('auth:user', JSON.stringify({ ...mockUser, name: 'Обновлённый студент' }));
    window.dispatchEvent(new Event('auth:changed'));

    await waitFor(() => {
      expect(screen.getByTestId('current-user')).toHaveTextContent('Обновлённый студент');
    });
  });

  it('clears user state on logout', async () => {
    localStorage.setItem('auth:user', JSON.stringify(mockUser));
    vi.spyOn(AuthApi, 'logout').mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderWithProviders(<Harness />);
    await waitFor(() => {
      expect(screen.getByTestId('current-user')).toHaveTextContent('Студент');
    });

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => {
      expect(screen.getByTestId('current-user')).toHaveTextContent('Гость');
    });
    expect(localStorage.getItem('auth:user')).toBeNull();
  });
});
