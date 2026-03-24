import { useState, useEffect, useCallback } from 'react';
import { Plus, PieChart, Search } from 'lucide-react';
import { PollCard } from './PollCard';
import { ExternalWeatherCard } from './ExternalWeatherCard';
import { PollApiService, Poll } from '../api/pollApi';
import { View } from '../types';
import { useAuth } from '../context/AuthContext';
import { canDeletePoll, hasPermission } from '../auth/rbac';

interface PollListProps {
  onViewChange: (view: View) => void;
  onPollSelect: (poll: Poll) => void;
  onResultsSelect: (poll: Poll) => void;
  onDeletePoll?: (poll: Poll) => void;
}

type PollStatus = 'all' | 'active' | 'completed' | 'upcoming';
type PollAnonymityFilter = 'all' | 'anonymous' | 'public';
type PollSortBy = 'deadline' | 'created' | 'title';
type PollSortOrder = 'asc' | 'desc';

const PER_PAGE = 6;

const parseQueryState = () => {
  const params = new URLSearchParams(window.location.search);
  const status = params.get('status');
  const anonymity = params.get('anonymity');
  const sortBy = params.get('sortBy');
  const sortOrder = params.get('sortOrder');
  const pageValue = Number(params.get('page') || '1');

  const parsedStatus: PollStatus = ['all', 'active', 'completed', 'upcoming'].includes(status ?? '')
    ? (status as PollStatus)
    : 'all';
  const parsedAnonymity: PollAnonymityFilter = ['all', 'anonymous', 'public'].includes(anonymity ?? '')
    ? (anonymity as PollAnonymityFilter)
    : 'all';
  const parsedSortBy: PollSortBy = ['deadline', 'created', 'title'].includes(sortBy ?? '')
    ? (sortBy as PollSortBy)
    : 'deadline';
  const parsedSortOrder: PollSortOrder = ['asc', 'desc'].includes(sortOrder ?? '')
    ? (sortOrder as PollSortOrder)
    : 'asc';

  return {
    status: parsedStatus,
    anonymity: parsedAnonymity,
    mineOnly: params.get('mine') === '1',
    search: params.get('q')?.trim() ?? '',
    sortBy: parsedSortBy,
    sortOrder: parsedSortOrder,
    page: Number.isFinite(pageValue) && pageValue > 0 ? Math.floor(pageValue) : 1,
  };
};

const writeQueryState = (state: {
  status: PollStatus;
  anonymity: PollAnonymityFilter;
  mineOnly: boolean;
  search: string;
  sortBy: PollSortBy;
  sortOrder: PollSortOrder;
  page: number;
}) => {
  const params = new URLSearchParams();
  if (state.status !== 'all') params.set('status', state.status);
  if (state.anonymity !== 'all') params.set('anonymity', state.anonymity);
  if (state.mineOnly) params.set('mine', '1');
  if (state.search) params.set('q', state.search);
  if (state.sortBy !== 'deadline') params.set('sortBy', state.sortBy);
  if (state.sortOrder !== 'asc') params.set('sortOrder', state.sortOrder);
  if (state.page > 1) params.set('page', String(state.page));

  const nextQuery = params.toString();
  const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, '', nextUrl);
  }
};

export function PollList({ onViewChange, onPollSelect, onResultsSelect, onDeletePoll }: PollListProps): JSX.Element {
  const { user } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PollStatus>('all');
  const [anonymity, setAnonymity] = useState<PollAnonymityFilter>('all');
  const [mineOnly, setMineOnly] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<PollSortBy>('deadline');
  const [sortOrder, setSortOrder] = useState<PollSortOrder>('asc');
  const [page, setPage] = useState(1);
  const [queryReady, setQueryReady] = useState(false);
  const showCreateButton = filter !== 'completed' && hasPermission(user, 'polls:create');

  useEffect(() => {
    const applyStateFromQuery = () => {
      const state = parseQueryState();
      setFilter(state.status);
      setAnonymity(state.anonymity);
      setMineOnly(state.mineOnly);
      setSearch(state.search);
      setSearchInput(state.search);
      setSortBy(state.sortBy);
      setSortOrder(state.sortOrder);
      setPage(state.page);
      setQueryReady(true);
    };

    applyStateFromQuery();
    const onPopState = () => applyStateFromQuery();
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!user && mineOnly) {
      setMineOnly(false);
      setPage(1);
    }
  }, [user, mineOnly]);

  useEffect(() => {
    if (!queryReady) return;
    writeQueryState({
      status: filter,
      anonymity,
      mineOnly,
      search,
      sortBy,
      sortOrder,
      page,
    });
  }, [filter, anonymity, mineOnly, search, sortBy, sortOrder, page, queryReady]);

  const loadPolls = useCallback(async () => {
    if (!queryReady) return;
    try {
      setLoading(true);
      const pollsData = await PollApiService.getPolls({
        status: filter,
        page,
        limit: PER_PAGE,
        search: search || undefined,
        isAnonymous: anonymity === 'all' ? undefined : anonymity === 'anonymous',
        ownerUserId: mineOnly && user ? user.id : undefined,
        sortBy,
        sortOrder,
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
  }, [queryReady, filter, page, search, anonymity, mineOnly, user, sortBy, sortOrder]);

  useEffect(() => {
    loadPolls();
  }, [loadPolls]);

  const applySearch = () => {
    setSearch(searchInput.trim());
    setPage(1);
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

  const endIndex = Math.min(page * PER_PAGE, total);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
        <div className="text-gray-500">Загрузка опросов...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8" role="alert">
        <div className="text-red-500 mb-4">{error}</div>
        <button
          type="button"
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
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">Фильтрация, поиск и сортировка</p>
        </div>
      </div>

      <ExternalWeatherCard />

      <div className="grid gap-3 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex gap-2">
          <label htmlFor="poll-search" className="sr-only">
            Поиск опросов
          </label>
          <input
            id="poll-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                applySearch();
              }
            }}
            placeholder="Поиск по названию и описанию"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
          />
          <button
            type="button"
            onClick={applySearch}
            className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700"
          >
            <Search className="h-4 w-4" /> Найти
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'all', label: 'Все' },
            { key: 'active', label: 'Активные' },
            { key: 'completed', label: 'Завершённые' },
            { key: 'upcoming', label: 'Без дедлайна' },
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`rounded-full border px-3 py-1 text-sm ${
                filter === key
                  ? 'border-blue-500 text-blue-600 dark:text-blue-300'
                  : 'border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
              }`}
              onClick={() => {
                setFilter(key as PollStatus);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-gray-500 dark:text-gray-300">
            Анонимность
            <select
              aria-label="Фильтр по анонимности"
              value={anonymity}
              onChange={(event) => {
                setAnonymity(event.target.value as PollAnonymityFilter);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="all">Все</option>
              <option value="anonymous">Только анонимные</option>
              <option value="public">Только публичные</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs text-gray-500 dark:text-gray-300">
            Сортировка
            <select
              aria-label="Сортировка опросов"
              value={sortBy}
              onChange={(event) => {
                setSortBy(event.target.value as PollSortBy);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="deadline">По дедлайну</option>
              <option value="created">По дате создания</option>
              <option value="title">По названию</option>
            </select>
          </label>

          <label className="grid gap-1 text-xs text-gray-500 dark:text-gray-300">
            Порядок
            <select
              aria-label="Порядок сортировки"
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value as PollSortOrder);
                setPage(1);
              }}
              className="rounded-lg border border-gray-200 px-2 py-2 text-sm dark:border-gray-700 dark:bg-gray-900"
            >
              <option value="asc">По возрастанию</option>
              <option value="desc">По убыванию</option>
            </select>
          </label>

          <label className="flex items-end gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={mineOnly}
              disabled={!user}
              onChange={(event) => {
                setMineOnly(event.target.checked);
                setPage(1);
              }}
              className="h-4 w-4"
            />
            Только мои опросы
          </label>
        </div>
      </div>

      {polls.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>Опросов по текущим фильтрам не найдено</p>
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
              onDelete={canDeletePoll(user, poll) && onDeletePoll ? () => onDeletePoll(poll) : undefined}
            />
          );
        })
      )}

      <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        {showCreateButton && (
          <button
            type="button"
            onClick={() => onViewChange('organizer')}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" /> Создать опрос
          </button>
        )}
        <div className="flex flex-col items-end gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span>{total > 0 ? `Показано ${endIndex} из ${total}` : 'Опросы не найдены'}</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page === 1}
              className="rounded-full border border-gray-200 px-3 py-1 text-xs disabled:opacity-50 dark:border-gray-700"
            >
              Назад
            </button>
            <button
              type="button"
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
