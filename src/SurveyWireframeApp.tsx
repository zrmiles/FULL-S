import { useEffect, useState } from "react";
import { CheckCircle2, Clock, LogIn, PieChart, ShieldCheck, UserCircle2 } from "lucide-react";
import { AppBar } from "./components/AppBar";
import { PollList } from "./components/PollList";
import { PollCreator } from "./components/PollCreator";
import { DetailedResults } from "./components/DetailedResults";
import { ProfilePanel } from "./components/ProfilePanel";
import { PollApiService, Poll, VoteResult } from "./api/pollApi";
import { View } from "./types";
import { useAuth } from "./context/AuthContext";

export default function SurveyWireframeApp(): JSX.Element {
  const { user, login, logout } = useAuth();
  const [view, setView] = useState<View>("login");
  const [currentPoll, setCurrentPoll] = useState<Poll | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const [results, setResults] = useState<VoteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const pollClosed = currentPoll ? isPollClosed(currentPoll) : false;

  useEffect(() => {
    if (user) {
      setView((prev) => (prev === "login" ? "home" : prev));
    } else {
      setView("login");
    }
  }, [user]);

  const handleCreatePoll = async (pollData: any) => {
    try {
      setLoading(true);
      await PollApiService.createPoll({ ...pollData, ownerUserId: user?.id });
      setView("home");
    } catch (error) {
      alert('Ошибка при создании опроса');
      console.error('Error creating poll:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePollSelect = (poll: Poll) => {
    setCurrentPoll(poll);
    setSelectedChoices([]);
    setShowConfirm(false);
    setView("poll");
  };

  const handleResultsSelect = (poll: Poll) => {
    setCurrentPoll(poll);
    setSelectedChoices([]);
    loadResults();
  };

  const handleVote = async () => {
    if (!currentPoll || selectedChoices.length === 0) return;
    if (isPollClosed(currentPoll)) {
      alert('Голосование завершено');
      setShowConfirm(false);
      return;
    }
    const isMulti = currentPoll.type === 'multi';
    const max = currentPoll.maxSelections ?? 1;
    if (!isMulti && selectedChoices.length !== 1) {
      alert('Выберите один вариант');
      return;
    }
    if (isMulti && selectedChoices.length > max) {
      alert(`Можно выбрать максимум ${max}`);
      return;
    }

    try {
      setLoading(true);
      if (!user) { alert('Войдите, чтобы голосовать'); return; }
      await PollApiService.vote(currentPoll.id, { userId: user.id, choices: selectedChoices });
      setShowConfirm(false);
      setView("success");
      setSelectedChoices([]);
    } catch (error) {
      alert('Ошибка при голосовании');
      console.error('Error voting:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadResults = async () => {
    if (!currentPoll) return;

    try {
      setLoading(true);
      const resultsData = await PollApiService.getResults(currentPoll.id);
      setResults(resultsData);
      setView("results");
    } catch (error) {
      alert('Ошибка при загрузке результатов');
      console.error('Error loading results:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigation = (next: View) => {
    if (!user && (next === "organizer" || next === "profile")) {
      setView("login");
      return;
    }
    setView(next);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppBar onNav={handleNavigation} current={view} />

      <main className="mx-auto w-full max-w-screen-md px-4 py-6">
        {view === "login" && (
          <section className="mx-auto max-w-md rounded-2xl bg-white p-6 shadow-sm">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-600">
                <ShieldCheck />
              </div>
              <div>
                <h1 className="text-xl font-bold">Добро пожаловать</h1>
                <p className="text-sm text-gray-500">
                  Ваш голос анонимен. Система проверяет уникальность (1 пользователь = 1 голос).
                </p>
              </div>
            </div>

            <LoginForm onSuccess={() => setView('home')} />

            <p className="mt-6 text-center text-xs text-gray-500">
              Нажимая «Войти», вы соглашаетесь с{" "}
              <a className="underline" href="#" onClick={(e) => e.preventDefault()}>
                политикой конфиденциальности
              </a>
              .
            </p>
          </section>
        )}

        {view === "home" && (
          <PollList 
            onViewChange={setView}
            onPollSelect={handlePollSelect}
            onResultsSelect={handleResultsSelect}
          />
        )}

        {view === "poll" && currentPoll && (
          <section className="grid gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-xl font-bold">
                  <Clock className="h-5 w-5" /> {currentPoll.title}
                </h2>
                <p className="mt-0.5 text-sm text-gray-600">
                  Дедлайн: {currentPoll.deadlineISO ? formatDate(currentPoll.deadlineISO) : 'Не указан'}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm text-gray-600">{currentPoll.description || 'Описание отсутствует'}</p>
              <AnonymityHint isAnonymous={currentPoll.isAnonymous} />

              <fieldset className="mt-4 grid gap-2" aria-label="Варианты ответа">
                {currentPoll.variants.map((variant) => {
                  const isSelected = selectedChoices.includes(variant.id);
                  const isMulti = currentPoll.type === 'multi';
                  return (
                    <label
                      key={variant.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:bg-gray-50 ${
                        isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200"
                      }`}
                    >
                      <input
                        type={isMulti ? "checkbox" : "radio"}
                        name="vote"
                        value={variant.id}
                        checked={isSelected}
                        onChange={() => handleChoiceToggle(variant.id, currentPoll, setSelectedChoices)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span>{variant.label}</span>
                    </label>
                  );
                })}
              </fieldset>

              <div className="mt-4 flex items-center justify-between gap-3">
                <small className="text-xs text-gray-500">
                  Тип: {currentPoll.type === 'single' ? 'один вариант' : 'несколько вариантов'}, 1 голос на пользователя
                  {currentPoll.deadlineISO && (
                    <>
                      <br />
                      Дедлайн (МСК): {formatDate(currentPoll.deadlineISO)}
                    </>
                  )}
                </small>
                <button
                  disabled={selectedChoices.length === 0 || loading || pollClosed}
                  onClick={() => setShowConfirm(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#3C2779] px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[#3C2779]/60 hover:bg-[#2A1B5A]"
                >
                  {pollClosed ? 'Опрос завершён' : loading ? 'Отправка...' : 'Отправить голос'}
                </button>
              </div>
            </div>
          </section>
        )}

        {view === "success" && (
          <section className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="mb-1 text-xl font-bold">Голос учтён</h2>
            <p className="text-sm text-gray-500">
              Результаты будут опубликованы {formatDate(new Date().toISOString())}
            </p>
            <div className="mt-5 grid gap-2">
              <button onClick={loadResults} className="rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A]">
                Перейти к результатам
              </button>
              <button onClick={() => setView("home")} className="rounded-xl border border-gray-200 px-4 py-2">
                К списку опросов
              </button>
            </div>
          </section>
        )}

        {view === "results" && currentPoll && results && (
          <DetailedResults 
            results={results}
            pollTitle={currentPoll.title}
            onBack={() => setView("home")}
          />
        )}

        {view === "organizer" && (
          <section className="grid gap-4">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Создать опрос</h2>
                <p className="mt-0.5 text-sm text-gray-600">Поля и настройки</p>
              </div>
            </div>

            <PollCreator 
              onCreatePoll={handleCreatePoll}
              onCancel={() => setView("home")}
            />
          </section>
        )}

        {view === "profile" && (
          <ProfilePanel onBack={() => setView("home")} />
        )}
      </main>

      {/* Confirm modal */}
      {showConfirm && currentPoll && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">Подтвердить голос?</h3>
              <p className="text-sm text-gray-600">
                Вы выбрали:{" "}
                <span className="font-medium text-gray-900">
                  {currentPoll.variants
                    .filter((v) => selectedChoices.includes(v.id))
                    .map((v) => v.label)
                    .join(", ")}
                </span>
                . {currentPoll.isAnonymous ? "Ваш голос анонимен." : "Это публичное голосование."}
              </p>
            <div className="mt-5 flex justify-end gap-2">
              <button 
                className="rounded-xl border border-gray-200 px-4 py-2" 
                onClick={() => setShowConfirm(false)}
              >
                Отмена
              </button>
              <button
                className="rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A]"
                onClick={handleVote}
                disabled={loading}
              >
                {loading ? 'Отправка...' : 'Подтвердить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MOSCOW_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

// Helper functions
function formatDate(iso: string): string {
  return MOSCOW_FORMATTER.format(new Date(iso));
}

function AnonymityHint({ isAnonymous }: { isAnonymous: boolean }): JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
      <ShieldCheck className="mt-0.5 h-4 w-4 text-green-600" />
      {isAnonymous ? (
        <p>
          Ваш выбор <span className="font-medium text-gray-900">анонимен</span>. Система хранит только факт участия и
          проверяет уникальность голоса — <span className="font-medium">1 пользователь = 1 голос</span>.
        </p>
      ) : (
        <p>
          Это <span className="font-medium text-gray-900">публичное голосование</span>. Организатор может видеть, кто
          выбрал каждый вариант.
        </p>
      )}
    </div>
  );
}

function AnonymityFootnote(): JSX.Element {
  return (
    <p className="mt-4 text-xs text-gray-500">
      ⓘ Результаты агрегированы. Нельзя сопоставить пользователя с выбранным вариантом.
    </p>
  );
}

function isPollClosed(poll: Poll): boolean {
  if (!poll.deadlineISO) return false;
  return new Date(poll.deadlineISO).getTime() <= Date.now();
}

function handleChoiceToggle(
  variantId: string,
  poll: Poll,
  setChoices: React.Dispatch<React.SetStateAction<string[]>>
) {
  const isMulti = poll.type === 'multi';
  const maxSelections = poll.maxSelections ?? 1;
  setChoices((prev) => {
    if (isMulti) {
      if (prev.includes(variantId)) {
        return prev.filter((id) => id !== variantId);
      }
      if (prev.length >= maxSelections) {
        alert(`Можно выбрать максимум ${maxSelections}`);
        return prev;
      }
      return [...prev, variantId];
    }
    return [variantId];
  });
}

function LoginForm({ onSuccess }: { onSuccess: () => void }): JSX.Element {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login'|'register'>('login');
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    try {
      setLoading(true);
      if (mode === 'login') {
        if (!username || !password) { alert('Введите ник и пароль'); return; }
        await login(username.trim(), password);
      } else {
        if (!username || !password || !email || !name) { alert('Заполните все поля'); return; }
        const trimmedUsername = username.trim();
        const trimmedEmail = email.trim();
        const trimmedName = name.trim();
        await register(trimmedUsername, trimmedEmail, trimmedName, password);
        setUsername("");
        setPassword("");
        setEmail("");
        setName("");
      }
      onSuccess();
    } catch (e) {
      alert('Ошибка авторизации');
      console.error(e);
    } finally { setLoading(false); }
  };
  return (
    <div className="grid gap-3">
      <div className="flex gap-2">
        <button className={`rounded-lg px-3 py-1 text-sm ${mode==='login'?'bg-gray-200':''}`} onClick={()=>setMode('login')}>Вход</button>
        <button className={`rounded-lg px-3 py-1 text-sm ${mode==='register'?'bg-gray-200':''}`} onClick={()=>setMode('register')}>Регистрация</button>
      </div>
      <label className="grid gap-1">
        <span className="text-sm text-gray-600">Никнейм</span>
        <input className="rounded-lg border border-gray-200 px-3 py-2" value={username} onChange={e=>setUsername(e.target.value)} />
      </label>
      {mode==='register' && (
        <>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">E-mail</span>
            <input className="rounded-lg border border-gray-200 px-3 py-2" value={email} onChange={e=>setEmail(e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-gray-600">Имя</span>
            <input className="rounded-lg border border-gray-200 px-3 py-2" value={name} onChange={e=>setName(e.target.value)} />
          </label>
        </>
      )}
      <label className="grid gap-1">
        <span className="text-sm text-gray-600">Пароль</span>
        <input type="password" className="rounded-lg border border-gray-200 px-3 py-2" value={password} onChange={e=>setPassword(e.target.value)} />
      </label>
      <button
        onClick={submit}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3C2779] px-4 py-3 text-white transition disabled:opacity-50 disabled:bg-[#3C2779]/60 hover:bg-[#2A1B5A]"
      >
        <LogIn className="h-5 w-5" /> {loading ? 'Отправка...' : (mode==='login'?'Войти':'Зарегистрироваться')}
      </button>
    </div>
  );
}
