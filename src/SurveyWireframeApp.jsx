import React, { useMemo, useState } from "react";
import { CheckCircle2, ChevronDown, Circle, Clock, LogIn, PieChart, Plus, ShieldCheck, UserCircle2, X } from "lucide-react";

/** \@typedef {"login"|"home"|"poll"|"success"|"results"|"organizer"} View */

const DEMO_POLL = {
  id: "poll-1",
  title: "Выбор старосты",
  description:
    "Выберите кандидата. 1 голос на пользователя. Результаты публикуются после дедлайна.",
  deadlineISO: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(), // +24h
  type: "single",
  variants: [
    { id: "v1", label: "Иван Петров" },
    { id: "v2", label: "Анна Смирнова" },
    { id: "v3", label: "Другое" },
  ],
};

const DEMO_RESULTS = [
  { id: "v1", label: "Иван Петров", count: 57 },
  { id: "v2", label: "Анна Смирнова", count: 65 },
  { id: "v3", label: "Другое", count: 2 },
];

export default function SurveyWireframeApp() {
  const [view, setView] = useState("login");
  const [voteChoice, setVoteChoice] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [createdTitle, setCreatedTitle] = useState("");
  const [createdDescription, setCreatedDescription] = useState("");
  const [createdVariants, setCreatedVariants] = useState(["Вариант 1", "Вариант 2"]);
  const [createdMulti, setCreatedMulti] = useState(false);
  const [createdMax, setCreatedMax] = useState(2);
  const [createdDeadline, setCreatedDeadline] = useState(() =>
    new Date(Date.now() + 36e5).toISOString().slice(0, 16)
  );

  const totalVotes = useMemo(() => DEMO_RESULTS.reduce((a, b) => a + b.count, 0), []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <AppBar onNav={(v) => setView(v)} current={view} />

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

            <div className="grid gap-3">
              <button
                onClick={() => setView("home")}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <LogIn className="h-5 w-5" /> Войти через SSO
              </button>
              <button
                onClick={() => setView("home")}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <UserCircle2 className="h-5 w-5" /> Войти по e-mail
              </button>
            </div>

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
          <section className="grid gap-4">
            <HeaderRow title="Опросы" subtitle="Активные и завершённые" />

            <FilterChips chips={["Активные", "Завершённые"]} />

            {/* Card 1 */}
            <PollCard
              title={DEMO_POLL.title}
              meta={`Дедлайн: ${formatDate(DEMO_POLL.deadlineISO)}`}
              status={{ label: "Активно", tone: "blue" }}
              description="Короткое описание опроса"
              onPrimary={() => setView("poll")}
              onSecondary={() => setView("results")}
            />

            {/* Card 2 (example) */}
            <PollCard
              title="Выбор темы курсовой"
              meta="Дедлайн: 05.11 18:00"
              status={{ label: "Ожидает", tone: "amber" }}
              description="Результаты скрыты до дедлайна"
              onPrimary={() => setView("poll")}
              onSecondary={() => setView("results")}
            />

            <div className="mt-2 flex justify-end">
              <button
                onClick={() => setView("organizer")}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm transition hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Создать опрос
              </button>
            </div>
          </section>
        )}

        {view === "poll" && (
          <section className="grid gap-4">
            <HeaderRow
              title={DEMO_POLL.title}
              subtitle={`Дедлайн: ${formatDate(DEMO_POLL.deadlineISO)}`}
              icon={<Clock className="h-5 w-5" />}
            />

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="mb-3 text-sm text-gray-600">{DEMO_POLL.description}</p>
              <AnonymityHint />

              <fieldset className="mt-4 grid gap-2" aria-label="Варианты ответа">
                {DEMO_POLL.variants.map((v) => (
                  <label
                    key={v.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:bg-gray-50 ${
                      voteChoice === v.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="vote"
                      value={v.id}
                      checked={voteChoice === v.id}
                      onChange={() => setVoteChoice(v.id)}
                      className="h-4 w-4 accent-blue-600"
                    />
                    <span>{v.label}</span>
                  </label>
                ))}
              </fieldset>

              <div className="mt-4 flex items-center justify-between">
                <small className="text-xs text-gray-500">Тип: один вариант, 1 голос на пользователя</small>
                <button
                  disabled={!voteChoice}
                  onClick={() => setShowConfirm(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Отправить голос
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
              <button onClick={() => setView("results")} className="rounded-xl bg-blue-600 px-4 py-2 text-white">
                Перейти к результатам
              </button>
              <button onClick={() => setView("home")} className="rounded-xl border border-gray-200 px-4 py-2">
                К списку опросов
              </button>
            </div>
          </section>
        )}

        {view === "results" && (
          <section className="grid gap-4">
            <HeaderRow
              title={`Результаты — ${DEMO_POLL.title}`}
              subtitle={`Обновлено: ${formatDate(new Date().toISOString())}`}
              icon={<PieChart className="h-5 w-5" />}
            />

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-sm text-gray-500">Всего голосов: {totalVotes}</p>
              <div className="mt-4 grid gap-3">
                {DEMO_RESULTS.map((r) => {
                  const pct = Math.round((r.count / totalVotes) * 100);
                  return (
                    <div key={r.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-medium">{r.label}</span>
                        <span className="tabular-nums text-gray-600">
                          {pct}% ({r.count})
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-gray-100">
                        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <AnonymityFootnote />

              <div className="mt-4 flex gap-2">
                <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm">Экспорт CSV</button>
                <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm">Поделиться</button>
              </div>
            </div>
          </section>
        )}

        {view === "organizer" && (
          <section className="grid gap-4">
            <HeaderRow title="Создать опрос" subtitle="Поля и настройки" />

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <LabelledInput
                  label="Заголовок"
                  value={createdTitle}
                  onChange={setCreatedTitle}
                  placeholder="Напр. Выбор старосты"
                />
                <LabelledInput
                  label="Дедлайн"
                  value={createdDeadline}
                  onChange={setCreatedDeadline}
                  type="datetime-local"
                />
              </div>
              <LabelledInput
                className="mt-3"
                label="Описание"
                value={createdDescription}
                onChange={setCreatedDescription}
                placeholder="Кратко опишите цель опроса"
              />

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <fieldset className="rounded-xl border border-gray-200 p-3">
                  <legend className="px-1 text-sm text-gray-500">Тип голосования</legend>
                  <label className="flex items-center gap-2 p-1">
                    <input
                      type="radio"
                      name="type"
                      className="accent-blue-600"
                      checked={!createdMulti}
                      onChange={() => setCreatedMulti(false)}
                    />{" "}
                    Один вариант
                  </label>
                  <label className="flex items-center gap-2 p-1">
                    <input
                      type="radio"
                      name="type"
                      className="accent-blue-600"
                      checked={createdMulti}
                      onChange={() => setCreatedMulti(true)}
                    />{" "}
                    Несколько вариантов
                  </label>
                  {createdMulti && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-sm text-gray-500">Макс. выбранных:</span>
                      <input
                        type="number"
                        min={1}
                        className="w-20 rounded-lg border border-gray-200 px-3 py-2"
                        value={createdMax}
                        onChange={(e) => setCreatedMax(parseInt(e.target.value || "1", 10))}
                      />
                    </div>
                  )}
                </fieldset>

                <fieldset className="rounded-xl border border-gray-200 p-3">
                  <legend className="px-1 text-sm text-gray-500">Ограничения и доступ</legend>
                  <label className="flex items-center gap-2 p-1">
                    <input type="checkbox" defaultChecked className="accent-blue-600" /> 1 голос на пользователя
                  </label>
                  <label className="flex items-center gap-2 p-1">
                    <input type="checkbox" className="accent-blue-600" /> Результаты после дедлайна
                  </label>
                  <label className="mt-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 text-sm">
                    Доступ: По группе <ChevronDown className="h-4 w-4" />
                  </label>
                </fieldset>
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Варианты</span>
                  <button
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-sm"
                    onClick={() => setCreatedVariants((vs) => [...vs, `Вариант ${vs.length + 1}`])}
                  >
                    <Plus className="h-4 w-4" /> Добавить
                  </button>
                </div>
                <div className="grid gap-2">
                  {createdVariants.map((v, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-gray-500">
                        <Circle className="h-4 w-4" />
                      </div>
                      <input
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
                        value={v}
                        onChange={(e) =>
                          setCreatedVariants((arr) => arr.map((x, i) => (i === idx ? e.target.value : x)))
                        }
                      />
                      <button
                        aria-label="Удалить вариант"
                        className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                        onClick={() => setCreatedVariants((arr) => arr.filter((_, i) => i !== idx))}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button className="rounded-xl border border-gray-200 px-4 py-2">Предпросмотр</button>
                <button className="rounded-xl bg-blue-600 px-4 py-2 text-white" onClick={() => setView("home")}>
                  Опубликовать
                </button>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Confirm modal */}
      {showConfirm && (
        <div role="dialog" aria-modal className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">Подтвердить голос?</h3>
            <p className="text-sm text-gray-600">
              Вы выбрали:{" "}
              <span className="font-medium text-gray-900">
                {DEMO_POLL.variants.find((v) => v.id === voteChoice)?.label}
              </span>
              . Ваш выбор анонимен.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded-xl border border-gray-200 px-4 py-2" onClick={() => setShowConfirm(false)}>
                Отмена
              </button>
              <button
                className="rounded-xl bg-blue-600 px-4 py-2 text-white"
                onClick={() => {
                  setShowConfirm(false);
                  setView("success");
                }}
              >
                Подтвердить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AppBar({ onNav, current }) {
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-screen-md items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-white">SV</div>
          <span className="hidden text-sm font-semibold sm:inline">Survey — честные голосования</span>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <NavBtn active={current === "home"} onClick={() => onNav("home")}>
            Опросы
          </NavBtn>
          <NavBtn active={current === "organizer"} onClick={() => onNav("organizer")}>
            Организатор
          </NavBtn>
          <NavBtn active={current === "results"} onClick={() => onNav("results")}>
            Результаты
          </NavBtn>
        </nav>
      </div>
    </header>
  );
}

function NavBtn({ active, children, onClick }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-1.5 transition ${active ? "bg-gray-100" : "hover:bg-gray-50"}`}>
      {children}
    </button>
  );
}

function HeaderRow({ title, subtitle, icon }) {
  return (
    <div className="flex items-start justify-between">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold">
          {icon} {title}
        </h2>
        {subtitle && <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p>}
      </div>
    </div>
  );
}

function PollCard({ title, meta, description, status, onPrimary, onSecondary }) {
  const toneClass =
    status.tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : status.tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-700";
  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify בין gap-3">
        <div>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-gray-500">{meta}</p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onPrimary} className="rounded-xl bg-blue-600 px-4 py-2 text-white">
          Проголосовать
        </button>
        <button onClick={onSecondary} className="rounded-xl border border-gray-200 px-4 py-2">
          Результаты
        </button>
      </div>
    </article>
  );
}

function FilterChips({ chips }) {
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c, i) => (
        <button key={i} className="rounded-full border border-gray-200 px-3 py-1 text-sm hover:bg-gray-50">
          {c}
        </button>
      ))}
    </div>
  );
}

function AnonymityHint() {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
      <ShieldCheck className="mt-0.5 h-4 w-4 text-green-600" />
      <p>
        Ваш выбор <span className="font-medium text-gray-900">анонимен</span>. Система хранит только факт участия и
        проверяет уникальность голоса — <span className="font-medium">1 пользователь = 1 голос</span>.
      </p>
    </div>
  );
}

function AnonymityFootnote() {
  return <p className="mt-4 text-xs text-gray-500">ⓘ Результаты агрегированы. Нельзя сопоставить пользователя с выбранным вариантом.</p>;
}

function LabelledInput({ label, value, onChange, placeholder, type = "text", className = "" }) {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm text-gray-600">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
    </label>
  );
}

function formatDate(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm} ${hh}:${mi}`;
}
