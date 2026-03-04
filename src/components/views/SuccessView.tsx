import { CheckCircle2 } from 'lucide-react';

interface SuccessViewProps {
  publishedAtLabel: string;
  onShowResults: () => void;
  onBackHome: () => void;
}

export function SuccessView({ publishedAtLabel, onShowResults, onBackHome }: SuccessViewProps): JSX.Element {
  return (
    <section className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-sm dark:bg-gray-800" aria-live="polite">
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-200">
        <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
      </div>
      <h2 className="mb-1 text-xl font-bold">Голос учтён</h2>
      <p className="text-sm text-gray-500">Результаты будут опубликованы {publishedAtLabel}</p>
      <div className="mt-5 grid gap-2">
        <button
          onClick={onShowResults}
          className="rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          Перейти к результатам
        </button>
        <button
          onClick={onBackHome}
          className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
        >
          К списку опросов
        </button>
      </div>
    </section>
  );
}
