import React, { useState } from 'react';
import { PieChart, Users, TrendingUp, Eye, EyeOff, Download, Share2 } from 'lucide-react';
import { API_BASE_URL, VoteResult } from '../api/pollApi';

interface DetailedResultsProps {
  results: VoteResult;
  pollTitle: string;
  onBack: () => void;
  pollId?: string;
}

export function DetailedResults({ results, pollTitle, onBack, pollId }: DetailedResultsProps): JSX.Element {
  const totalVotes = results.total;
  const totalVoters = results.totalVoters;
  const participationRate = results.participationRate;

  // Сортируем результаты по количеству голосов
  const sortedResults = [...results.results].sort((a, b) => b.count - a.count);
  const winner = sortedResults[0];
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const exportCsv = (targetPollId: string) => {
    const url = `${API_BASE_URL}/polls/${targetPollId}/results?format=csv`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `poll-${targetPollId}-results.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="grid gap-6">
      {/* Заголовок */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-900 dark:text-gray-100">
            <PieChart className="h-6 w-6" /> Результаты — {pollTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Обновлено: {new Date().toLocaleString('ru-RU')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {results.isAnonymous ? (
            <div className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-700 dark:bg-green-900/40 dark:text-green-200">
              <EyeOff className="h-4 w-4" />
              Анонимное
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
              <Eye className="h-4 w-4" />
              Публичное
            </div>
          )}
        </div>
      </div>

      {/* Статистические карточки */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800 dark:text-gray-100">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-200">
              <PieChart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Всего голосов</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalVotes}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800 dark:text-gray-100">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-200">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Участников</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalVoters}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm dark:bg-gray-800 dark:text-gray-100">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-200">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Участие</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{participationRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Победитель */}
      {winner && winner.count > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-4 dark:border-yellow-700/50 dark:from-yellow-900/20 dark:to-orange-900/10">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-yellow-100 text-yellow-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-yellow-700 dark:text-yellow-200">Победитель</p>
              <p className="text-xl font-bold text-yellow-900 dark:text-yellow-100">{winner.label}</p>
              <p className="text-sm text-yellow-600 dark:text-yellow-200">
                {winner.count} голосов ({Math.round((winner.count / totalVotes) * 100)}%)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Детальные результаты */}
      <div className="rounded-xl bg-white p-6 shadow-sm dark:bg-gray-800 dark:text-gray-100">
        <h3 className="mb-4 text-lg font-semibold">Детальные результаты</h3>
        
        <div className="space-y-4">
          {sortedResults.map((result, index) => {
            const percentage = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
            const isWinner = index === 0 && result.count > 0;
            
            return (
              <div key={result.id} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{result.label}</span>
                    {isWinner && (
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200">
                        Победитель
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{result.count}</span>
                    <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({percentage}%)</span>
                  </div>
                </div>
                
                <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                  <div 
                    className={`h-3 rounded-full transition-all duration-500 ${
                      isWinner ? 'bg-gradient-to-r from-yellow-400 to-orange-400' : 'bg-[#3C2779]'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                {!results.isAnonymous && result.voters && result.voters.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {result.voters.map((voter) => (
                      <div
                        key={`${result.id}-${voter.id}`}
                        className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 dark:border-gray-600 dark:text-gray-200"
                      >
                        {voter.avatarUrl ? (
                          <img
                            src={voter.avatarUrl}
                            alt={voter.username ?? voter.name}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                            {getInitials(voter.name, voter.username)}
                          </div>
                        )}
                        <span>{voter.username ?? voter.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Дополнительная информация */}
        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2 dark:text-gray-100">Информация о голосовании</h4>
              <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <div className="flex justify-between">
                  <span>Тип:</span>
                  <span>{results.isAnonymous ? 'Анонимное' : 'Публичное'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Участников:</span>
                  <span>{totalVoters}</span>
                </div>
                <div className="flex justify-between">
                  <span>Всего голосов:</span>
                  <span>{totalVotes}</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2 dark:text-gray-100">Экспорт данных</h4>
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                  onClick={() => pollId && exportCsv(pollId)}
                >
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                    setShareMessage('Ссылка сохранена в буфер обмена');
                    setTimeout(() => setShareMessage(null), 2000);
                  }}
                >
                  <Share2 className="h-4 w-4" />
                  Поделиться
                </button>
              </div>
              {shareMessage && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{shareMessage}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-between">
        <button 
          onClick={onBack}
          className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          ← Назад к опросам
        </button>
        
        <div className="flex gap-2">
          <button
            className="rounded-xl bg-[#3C2779] px-4 py-2 text-white text-sm hover:bg-[#2A1B5A]"
            onClick={() => pollId && exportCsv(pollId)}
          >
            Экспорт результатов
          </button>
        </div>
      </div>
    </div>
  );
}

function getInitials(name?: string, username?: string | null): string {
  const fromName = name?.trim();
  if (fromName && fromName.length > 0) {
    return fromName.slice(0, 2).toUpperCase();
  }
  const fromUsername = username?.trim();
  if (fromUsername && fromUsername.length > 0) {
    return fromUsername.slice(0, 2).toUpperCase();
  }
  return '?';
}
  const exportCsv = async (targetPollId: string) => {
    try {
      const csv = await PollApiService.exportResultsCsv(targetPollId);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `poll-${targetPollId}-results.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV', err);
      alert('Не удалось экспортировать CSV');
    }
  };
