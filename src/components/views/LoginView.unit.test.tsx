import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginView } from './LoginView';

const authMock = {
  login: vi.fn(),
  register: vi.fn(),
};

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => authMock,
}));

describe('LoginView', () => {
  beforeEach(() => {
    authMock.login.mockReset();
    authMock.register.mockReset();
  });

  it('validates empty login form before calling auth API', async () => {
    const onNotify = vi.fn();
    const user = userEvent.setup();

    render(<LoginView onSuccess={vi.fn()} onNotify={onNotify} />);
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(authMock.login).not.toHaveBeenCalled();
    expect(onNotify).toHaveBeenCalledWith('Введите ник и пароль', 'error');
  });

  it('submits trimmed credentials and notifies on success', async () => {
    authMock.login.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const onNotify = vi.fn();
    const user = userEvent.setup();

    render(<LoginView onSuccess={onSuccess} onNotify={onNotify} />);
    await user.type(screen.getByLabelText('Никнейм'), '  student  ');
    await user.type(screen.getByLabelText('Пароль'), 'Student123!');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(authMock.login).toHaveBeenCalledWith('student', 'Student123!');
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith('Вход выполнен', 'success');
  });

  it('handles registration mode validation and API errors', async () => {
    authMock.register.mockRejectedValue(new Error('registration failed'));
    const onNotify = vi.fn();
    const user = userEvent.setup();

    render(<LoginView onSuccess={vi.fn()} onNotify={onNotify} />);
    await user.click(screen.getByRole('tab', { name: 'Регистрация' }));
    await user.type(screen.getByLabelText('Никнейм'), 'student');
    await user.type(screen.getByLabelText('E-mail'), 'student@example.com');
    await user.type(screen.getByLabelText('Имя'), 'Студент');
    await user.type(screen.getByLabelText('Пароль'), 'Student123!');
    await user.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(authMock.register).toHaveBeenCalledWith('student', 'student@example.com', 'Студент', 'Student123!');
    expect(onNotify).toHaveBeenCalledWith('Ошибка авторизации', 'error');
  });
});
