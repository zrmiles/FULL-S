import React from 'react';
import { PieChart, Users, TrendingUp, Eye, EyeOff, Download, Share2, UserCircle2 } from 'lucide-react';
import { VoteResult } from '../api/pollApi';

interface DetailedResultsProps {
  results: VoteResult;
  pollTitle: string;
  onBack: () => void;
}

export function DetailedResults({ results, pollTitle, onBack }: DetailedResultsProps): JSX.Element {
  const totalVotes = results.total;
  const totalVoters = results.totalVoters;
  const participationRate = results.participationRate;

  // Сортируем результаты по количеству голосов
  const sortedResults = [...results.results].sort((a, b) => b.count - a.count);
  const winner = sortedResults[0];

  return (
    <div className="grid gap-6">
      {/* Заголовок */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <PieChart className="h-6 w-6" /> Результаты — {pollTitle}
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Обновлено: {new Date().toLocaleString('ru-RU')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {results.isAnonymous ? (
            <div className="flex items-center gap-1 rounded-full bg-green-100 px-3 py-1 text-sm text-green-700">
              <EyeOff className="h-4 w-4" />
              Анонимное
            </div>
          ) : (
            <div className="flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-700">
              <Eye className="h-4 w-4" />
              Публичное
            </div>
          )}
        </div>
      </div>

      {/* Статистические карточки */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-100 text-blue-600">
              <PieChart className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Всего голосов</p>
              <p className="text-2xl font-bold">{totalVotes}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-green-100 text-green-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Участников</p>
              <p className="text-2xl font-bold">{totalVoters}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-purple-100 text-purple-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Участие</p>
              <p className="text-2xl font-bold">{participationRate.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Победитель */}
      {winner && winner.count > 0 && (
        <div className="rounded-xl bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-yellow-100 text-yellow-600">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm text-yellow-700">Победитель</p>
              <p className="text-xl font-bold text-yellow-900">{winner.label}</p>
              <p className="text-sm text-yellow-600">
                {winner.count} голосов ({Math.round((winner.count / totalVotes) * 100)}%)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Детальные результаты */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-semibold">Детальные результаты</h3>
        
        <div className="space-y-4">
          {sortedResults.map((result, index) => {
            const percentage = totalVotes > 0 ? Math.round((result.count / totalVotes) * 100) : 0;
            const isWinner = index === 0 && result.count > 0;
            
            return (
              <div key={result.id} className="relative">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">{result.label}</span>
                    {isWinner && (
                      <span className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
                        Победитель
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-gray-900">{result.count}</span>
                    <span className="ml-2 text-sm text-gray-500">({percentage}%)</span>
                  </div>
                </div>
                
                <div className="h-3 w-full rounded-full bg-gray-200">
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
                        className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700"
                      >
                        {voter.avatarUrl ? (
                          <img
                            src={voter.avatarUrl}
                            alt={voter.username ?? voter.name}
                            className="h-6 w-6 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-gray-600">
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
        <div className="mt-6 border-t border-gray-200 pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-2">Информация о голосовании</h4>
              <div className="space-y-2 text-sm text-gray-600">
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
              <h4 className="text-sm font-medium text-gray-900 mb-2">Экспорт данных</h4>
              <div className="flex gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <Download className="h-4 w-4" />
                  CSV
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
                  <Share2 className="h-4 w-4" />
                  Поделиться
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Кнопки действий */}
      <div className="flex justify-between">
        <button 
          onClick={onBack}
          className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50"
        >
          ← Назад к опросам
        </button>
        
        <div className="flex gap-2">
          <button className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
            Обновить
          </button>
          <button className="rounded-xl bg-[#3C2779] px-4 py-2 text-white text-sm hover:bg-[#2A1B5A]">
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
