import React, { useState } from 'react';
import { Circle, Plus, X } from 'lucide-react';
import { LabelledInputProps } from '../types';

interface PollCreatorProps {
  onCreatePoll: (poll: {
    title: string;
    description: string;
    deadlineISO?: string;
    type: 'single' | 'multi';
    variants: string[];
    maxSelections: number;
    isAnonymous: boolean;
  }) => void;
  onCancel: () => void;
}

const toInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export function PollCreator({ onCreatePoll, onCancel }: PollCreatorProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState(() => toInputValue(new Date(Date.now() + 36e5)));
  const [isMulti, setIsMulti] = useState(false);
  const [maxSelections, setMaxSelections] = useState(2);
  const [variants, setVariants] = useState(['Вариант 1', 'Вариант 2']);
  const [isAnonymous, setIsAnonymous] = useState(true);
  const minDeadline = toInputValue(new Date());

  const handleSubmit = () => {
    if (!title.trim() || variants.length < 2) {
      alert('Заполните заголовок и добавьте минимум 2 варианта');
      return;
    }

    const deadlineDate = deadline ? new Date(deadline) : null;
    if (deadlineDate && deadlineDate < new Date()) {
      alert('Дедлайн не может быть в прошлом');
      return;
    }

    onCreatePoll({
      title: title.trim(),
      description: description.trim(),
      deadlineISO: deadlineDate ? deadlineDate.toISOString() : undefined,
      type: isMulti ? 'multi' : 'single',
      variants: variants.filter(v => v.trim()),
      maxSelections: isMulti ? maxSelections : 1,
      isAnonymous: isAnonymous,
    });
  };

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-gray-800 dark:text-gray-100">
      <div className="grid gap-3 md:grid-cols-2">
        <LabelledInput
          label="Заголовок"
          value={title}   
          onChange={setTitle}
          placeholder="Напр. Выбор старосты"
        />
        <LabelledInput
          label="Дедлайн"
          value={deadline}
          onChange={setDeadline}
          type="datetime-local"
          min={minDeadline}
        />
      </div>
      <LabelledInput
        className="mt-3"
        label="Описание"
        value={description}
        onChange={setDescription}
        placeholder="Кратко опишите цель опроса"
      />

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <fieldset className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
          <legend className="px-1 text-sm text-gray-500 dark:text-gray-300">Тип голосования</legend>
          <label className="flex items-center gap-2 p-1 text-gray-700 dark:text-gray-200">
            <input
              type="radio"
              name="type"
              className="accent-blue-600"
              checked={!isMulti}
              onChange={() => setIsMulti(false)}
            />
            Один вариант
          </label>
          <label className="flex items-center gap-2 p-1 text-gray-700 dark:text-gray-200">
            <input
              type="radio"
              name="type"
              className="accent-blue-600"
              checked={isMulti}
              onChange={() => setIsMulti(true)}
            />
            Несколько вариантов
          </label>
          {isMulti && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-300">Макс. выбранных:</span>
              <input
                type="number"
                min={1}
                className="w-20 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={maxSelections}
                onChange={(e) => setMaxSelections(parseInt(e.target.value || "1", 10))}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="rounded-xl border border-gray-200 p-3 dark:border-gray-700">
          <legend className="px-1 text-sm text-gray-500 dark:text-gray-300">Ограничения и доступ</legend>
          <label className="flex items-center gap-2 p-1 text-gray-700 dark:text-gray-200">
            <input type="checkbox" defaultChecked className="accent-blue-600" />
            1 голос на пользователя
          </label>
          <label className="flex items-center gap-2 p-1 text-gray-700 dark:text-gray-200">
            <input type="checkbox" className="accent-blue-600" />
            Результаты после дедлайна
          </label>
          
          <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
            <label className="text-sm font-medium text-gray-700 mb-2 block dark:text-gray-200">Тип голосования</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer dark:border-gray-700 dark:hover:bg-gray-700">
                <input
                  type="radio"
                  name="anonymity"
                  checked={isAnonymous}
                  onChange={() => setIsAnonymous(true)}
                  className="accent-blue-600"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Анонимное</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Голоса скрыты, видны только результаты</div>
                </div>
              </label>
              <label className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer dark:border-gray-700 dark:hover:bg-gray-700">
                <input
                  type="radio"
                  name="anonymity"
                  checked={!isAnonymous}
                  onChange={() => setIsAnonymous(false)}
                  className="accent-blue-600"
                />
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">Публичное</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Можно видеть, кто за что проголосовал</div>
                </div>
              </label>
            </div>
          </div>
        </fieldset>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-gray-500">Варианты</span>
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-sm dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-700"
            onClick={() => setVariants([...variants, `Вариант ${variants.length + 1}`])}
          >
            <Plus className="h-4 w-4" /> Добавить
          </button>
        </div>
        <div className="grid gap-2">
          {variants.map((variant, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-200">
                <Circle className="h-4 w-4" />
              </div>
              <input
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                value={variant}
                onChange={(e) =>
                  setVariants((arr) => arr.map((x, i) => (i === idx ? e.target.value : x)))
                }
              />
              <button
                aria-label="Удалить вариант"
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                onClick={() => setVariants((arr) => arr.filter((_, i) => i !== idx))}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button 
          onClick={onCancel}
          className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50"
        >
          Отмена
        </button>
        <button 
          onClick={handleSubmit}
          className="rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A]"
        >
          Создать опрос
        </button>
      </div>
    </div>
  );
}

function LabelledInput({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = "text", 
  className = "",
  min,
}: LabelledInputProps): JSX.Element {
  return (
    <label className={`grid gap-1 ${className}`}>
      <span className="text-sm text-gray-600 dark:text-gray-300">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        className="rounded-lg border border-gray-200 px-3 py-2 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      />
    </label>
  );
}
