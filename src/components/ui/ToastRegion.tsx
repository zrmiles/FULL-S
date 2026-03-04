import { useEffect } from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastItem {
  id: string;
  message: string;
  kind: ToastKind;
}

interface ToastRegionProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  durationMs?: number;
}

const TOAST_STYLE: Record<ToastKind, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-100',
  success: 'border-green-200 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/40 dark:text-green-100',
  error: 'border-red-200 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/40 dark:text-red-100',
};

export function ToastRegion({ toasts, onDismiss, durationMs = 3500 }: ToastRegionProps): JSX.Element {
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map((toast) => window.setTimeout(() => onDismiss(toast.id), durationMs));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [toasts, onDismiss, durationMs]);

  if (!toasts.length) {
    return <></>;
  }

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] grid w-[min(92vw,24rem)] gap-2"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto rounded-xl border px-3 py-2 text-sm shadow-md ${TOAST_STYLE[toast.kind]}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
        >
          <div className="flex items-start justify-between gap-3">
            <p>{toast.message}</p>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Закрыть уведомление"
              className="rounded-md px-2 py-0.5 text-xs hover:bg-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Закрыть
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
