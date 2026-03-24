import { useCallback, useEffect, useState } from 'react';
import { CloudSun, RefreshCw } from 'lucide-react';
import { PollApiService, WeatherSnapshot } from '../api/pollApi';

export function ExternalWeatherCard(): JSX.Element {
  const [data, setData] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWeather = useCallback(async () => {
    try {
      setLoading(true);
      const snapshot = await PollApiService.getWeatherSnapshot();
      setData(snapshot);
      setError(null);
    } catch (err) {
      console.error('Failed to load external weather data', err);
      setError('Внешний сервис погоды временно недоступен');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeather();
  }, [loadWeather]);

  return (
    <section className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4 dark:border-sky-900/50 dark:bg-sky-950/30" aria-live="polite">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-sky-900 dark:text-sky-200">
          <CloudSun className="h-4 w-4" aria-hidden="true" />
          Внешние данные: погода
        </h3>
        <button
          type="button"
          onClick={() => void loadWeather()}
          className="inline-flex items-center gap-1 rounded-md border border-sky-200 px-2 py-1 text-xs text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:text-sky-200 dark:hover:bg-sky-900/50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Обновить
        </button>
      </div>

      {loading && (
        <p className="text-sm text-sky-800 dark:text-sky-200">Загрузка погодных данных...</p>
      )}

      {!loading && error && (
        <div className="space-y-1">
          <p className="text-sm text-rose-700 dark:text-rose-300">{error}</p>
          <p className="text-xs text-sky-900/80 dark:text-sky-200/90">
            Основной функционал приложения работает в обычном режиме.
          </p>
        </div>
      )}

      {!loading && !error && !data && (
        <p className="text-sm text-sky-800 dark:text-sky-200">Данные отсутствуют.</p>
      )}

      {!loading && !error && data && (
        <div className="grid gap-1 text-sm text-sky-900 dark:text-sky-100 md:grid-cols-2">
          <p>
            <span className="font-medium">Город:</span> {data.city}
          </p>
          <p>
            <span className="font-medium">Температура:</span> {data.temperatureC.toFixed(1)}°C
          </p>
          <p>
            <span className="font-medium">Ощущается как:</span> {data.feelsLikeC.toFixed(1)}°C
          </p>
          <p>
            <span className="font-medium">Состояние:</span> {data.conditionDescription}
          </p>
          <p>
            <span className="font-medium">Влажность:</span> {data.humidityPercent}%
          </p>
          <p>
            <span className="font-medium">Ветер:</span> {data.windSpeedMps.toFixed(1)} м/с
          </p>
          <p className="text-xs text-sky-800/80 dark:text-sky-200/80 md:col-span-2">
            Источник: {data.source}
            {data.cached ? ' (из кэша)' : ''} • обновлено {new Date(data.observedAt).toLocaleString('ru-RU')}
          </p>
        </div>
      )}
    </section>
  );
}
