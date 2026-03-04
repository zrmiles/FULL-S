import { useState } from 'react';
import { LogIn, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import type { ToastKind } from '../ui/ToastRegion';

interface LoginViewProps {
  onSuccess: () => void;
  onNotify: (message: string, kind?: ToastKind) => void;
}

export function LoginView({ onSuccess, onNotify }: LoginViewProps): JSX.Element {
  return (
    <section className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800 dark:text-gray-100" aria-labelledby="login-title">
      <div className="mb-6 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-200">
          <ShieldCheck aria-hidden="true" />
        </div>
        <div>
          <h1 id="login-title" className="text-xl font-bold text-gray-900 dark:text-gray-50">
            Добро пожаловать
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-300">
            Ваш голос анонимен. Система проверяет уникальность (1 пользователь = 1 голос).
          </p>
        </div>
      </div>

      <LoginForm onSuccess={onSuccess} onNotify={onNotify} />

      <p className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
        Нажимая «Войти», вы соглашаетесь с{' '}
        <a className="underline" href="#" onClick={(e) => e.preventDefault()}>
          политикой конфиденциальности
        </a>
        .
      </p>
    </section>
  );
}

function LoginForm({ onSuccess, onNotify }: LoginViewProps): JSX.Element {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    try {
      setLoading(true);
      if (mode === 'login') {
        if (!username || !password) {
          onNotify('Введите ник и пароль', 'error');
          return;
        }
        await login(username.trim(), password);
      } else {
        if (!username || !password || !email || !name) {
          onNotify('Заполните все поля', 'error');
          return;
        }
        await register(username.trim(), email.trim(), name.trim(), password);
        setUsername('');
        setPassword('');
        setEmail('');
        setName('');
      }
      onSuccess();
      onNotify(mode === 'login' ? 'Вход выполнен' : 'Регистрация завершена', 'success');
    } catch (e) {
      console.error(e);
      onNotify('Ошибка авторизации', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      aria-busy={loading}
    >
      <div className="flex gap-2" role="tablist" aria-label="Режим авторизации">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          className={`rounded-lg px-3 py-1 text-sm ${mode === 'login' ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
          onClick={() => setMode('login')}
        >
          Вход
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'register'}
          className={`rounded-lg px-3 py-1 text-sm ${mode === 'register' ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
          onClick={() => setMode('register')}
        >
          Регистрация
        </button>
      </div>

      <label className="grid gap-1">
        <span className="text-sm text-gray-600 dark:text-gray-300">Никнейм</span>
        <input
          autoComplete="username"
          className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>

      {mode === 'register' && (
        <>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-300">E-mail</span>
            <input
              autoComplete="email"
              className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600 dark:text-gray-300">Имя</span>
            <input
              autoComplete="name"
              className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </>
      )}

      <label className="grid gap-1">
        <span className="text-sm text-gray-600 dark:text-gray-300">Пароль</span>
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3C2779] px-4 py-3 text-white transition hover:bg-[#2A1B5A] disabled:bg-[#3C2779]/60 disabled:opacity-50"
      >
        <LogIn className="h-5 w-5" aria-hidden="true" /> {loading ? 'Отправка...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
      </button>
    </form>
  );
}
