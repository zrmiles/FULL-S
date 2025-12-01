import React, { useState, useEffect, useCallback } from 'react';
import { Plus, PieChart } from 'lucide-react';
import { PollCard } from './PollCard';
import { PollApiService, Poll } from '../api/pollApi';
import { View } from '../types';
import { useAuth } from '../context/AuthContext';

interface PollListProps {
  onViewChange: (view: View) => void;
  onPollSelect: (poll: Poll) => void;
  onResultsSelect: (poll: Poll) => void;
}

const PER_PAGE = 6;

export function PollList({ onViewChange, onPollSelect, onResultsSelect }: PollListProps): JSX.Element {
  const { user } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [page, setPage] = useState(1);
  const showCreateButton = filter !== 'completed';

  const loadPolls = useCallback(async () => {
    try {
      setLoading(true);
      const pollsData = await PollApiService.getPolls({
        status: filter,
        page,
        limit: PER_PAGE,
      });
      setPolls(pollsData.items);
      setTotal(pollsData.total);
      setError(null);
    } catch (err) {
      setError('Ошибка загрузки опросов');
      console.error('Error loading polls:', err);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  const handleDeletePoll = async (pollId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот опрос?')) {
      return;
    }

    try {
      await PollApiService.deletePoll(pollId);
      setPolls((prev) => prev.filter((poll) => poll.id !== pollId));
      setTotal((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      alert('Ошибка при удалении опроса');
      console.error('Error deleting poll:', err);
    }
  };

  const formatDate = (iso: string): string => {
    const formatter = new Intl.DateTimeFormat('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
    return formatter.format(new Date(iso));
  };

  const getPollStatus = (poll: Poll) => {
    const now = new Date();
    const deadline = poll.deadlineISO ? new Date(poll.deadlineISO) : null;
    if (deadline && now > deadline) {
      return { label: 'Завершён', tone: 'gray' as const, state: 'completed' as const };
    }
    if (deadline && now < deadline) {
      return { label: 'Активно', tone: 'blue' as const, state: 'active' as const };
    }
    return { label: 'Ожидает', tone: 'amber' as const, state: 'upcoming' as const };
  };

  const startIndex = total === 0 ? 0 : (page - 1) * PER_PAGE + 1;
  const endIndex = Math.min(page * PER_PAGE, total);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Загрузка опросов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">{error}</div>
        <button
          onClick={loadPolls}
          className="rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A]"
        >
          Попробовать снова
        </button>
      </div>
    );
  }

  return (
    <section className="grid gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-gray-100">
            <PieChart className="h-5 w-5" /> Опросы
          </h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">Активные и завершённые</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { key: 'all', label: 'Все' },
          { key: 'active', label: 'Активные' },
          { key: 'completed', label: 'Завершённые' },
        ].map(({ key, label }) => (
          <button
            key={key}
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === key ? 'border-blue-500 text-blue-600 dark:text-blue-300' : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
            }`}
            onClick={() => {
              setFilter(key as typeof filter);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {polls.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Опросов в этой категории пока нет</p>
        </div>
      ) : (
        polls.map((poll) => {
          const status = getPollStatus(poll);
          return (
            <PollCard
              key={poll.id}
              title={poll.title}
              meta={`Дедлайн: ${poll.deadlineISO ? formatDate(poll.deadlineISO) : 'Не указан'}`}
              description={poll.description || 'Описание отсутствует'}
              status={status}
              onPrimary={() => onPollSelect(poll)}
              onSecondary={() => onResultsSelect(poll)}
              onDelete={user && user.role === 'admin' ? () => handleDeletePoll(poll.id) : undefined}
            />
          );
        })
      )}

      <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {showCreateButton && (
          <button
            onClick={() => onViewChange('organizer')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" /> Создать опрос
          </button>
        )}
        <div className="flex flex-col items-end gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>
            {total > 0 ? `Показано ${endIndex} из ${total}` : 'Опросы не найдены'}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-gray-700"
            >
              Назад
            </button>
            <button
              onClick={() => setPage((prev) => prev + 1)}
              disabled={page * PER_PAGE >= total}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-gray-700"
            >
              Далее
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
