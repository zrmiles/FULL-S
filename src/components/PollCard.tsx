import React from 'react';
import { Trash2 } from 'lucide-react';
import { PollCardProps } from '../types';

export function PollCard({ 
  title, 
  meta, 
  description, 
  status, 
  onPrimary, 
  onSecondary, 
  onDelete 
}: PollCardProps): JSX.Element {
  const toneClass =
    status.tone === "blue"
      ? "bg-blue-100 text-blue-700"
      : status.tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-700";

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-gray-500">{meta}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${toneClass}`}>
            {status.label}
          </span>
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition"
              title="Удалить опрос"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onPrimary}
          className="rounded-xl bg-[#3C2779] px-4 py-2 text-white transition hover:bg-[#2A1B5A]"
        >
          Проголосовать
        </button>
        <button 
          onClick={onSecondary} 
          className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50 transition"
        >
          Результаты
        </button>
      </div>
    </article>
  );
}


