import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppBar } from './components/AppBar';
import { PollList } from './components/PollList';
import { PollCreator } from './components/PollCreator';
import { DetailedResults } from './components/DetailedResults';
import { ProfilePanel } from './components/ProfilePanel';
import { AdminUserRolesPanel } from './components/AdminUserRolesPanel';
import { LoginView } from './components/views/LoginView';
import { PollVotingView } from './components/views/PollVotingView';
import { SuccessView } from './components/views/SuccessView';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { ToastItem, ToastKind, ToastRegion } from './components/ui/ToastRegion';
import { PollApiService, Poll, PollAttachment, PollCreate, VoteResult } from './api/pollApi';
import { View } from './types';
import { useAuth } from './context/AuthContext';
import { canAccessView, canDeletePoll, hasPermission } from './auth/rbac';

const VIEW_PATHS: Record<View, string> = {
  login: '/вход',
  home: '/опросы',
  poll: '/голосование',
  success: '/успех',
  results: '/результаты',
  organizer: '/новый-опрос',
  profile: '/профиль',
  admin: '/админ',
};

const MOSCOW_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'Europe/Moscow',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
};

function normalizePath(pathname: string): string {
  const trimmed = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  try {
    return decodeURIComponent(trimmed).toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function toPath(view: View): string {
  return VIEW_PATHS[view] ?? VIEW_PATHS.home;
}

function toView(pathname: string): View {
  const normalized = normalizePath(pathname);
  if (normalized === '/') return 'home';
  const found = (Object.entries(VIEW_PATHS) as Array<[View, string]>).find(([, path]) => normalizePath(path) === normalized);
  return found?.[0] ?? 'home';
}

function formatDate(iso: string): string {
  return MOSCOW_FORMATTER.format(new Date(iso));
}

function isPollClosed(poll: Poll): boolean {
  if (!poll.deadlineISO) return false;
  return new Date(poll.deadlineISO).getTime() <= Date.now();
}

function createToastId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function SurveyWireframeApp(): JSX.Element {
  const { user } = useAuth();
  const [view, setView] = useState<View>(() => toView(window.location.pathname));
  const [currentPoll, setCurrentPoll] = useState<Poll | null>(null);
  const [selectedChoices, setSelectedChoices] = useState<string[]>([]);
  const [results, setResults] = useState<VoteResult | null>(null);
  const [attachments, setAttachments] = useState<PollAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState<string | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [pollListVersion, setPollListVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const pollClosed = currentPoll ? isPollClosed(currentPoll) : false;
  const canVote = hasPermission(user, 'polls:vote');
  const canManageAttachments = !!(user && currentPoll && canDeletePoll(user, currentPoll));

  const notify = useCallback((message: string, kind: ToastKind = 'info') => {
    setToasts((prev) => [...prev, { id: createToastId(), message, kind }]);
  }, []);

  const dismissToast = useCallback((toastId: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== toastId));
  }, []);

  const requestConfirm = useCallback((next: ConfirmState) => {
    setConfirmState(next);
  }, []);

  const runConfirmedAction = useCallback(async () => {
    if (!confirmState) return;
    const action = confirmState.onConfirm;
    setConfirmState(null);
    try {
      await action();
    } catch (error) {
      console.error('Failed to execute confirmed action', error);
      notify('Операция не выполнена', 'error');
    }
  }, [confirmState, notify]);

  const navigateToView = useCallback(
    (next: View, options?: { replace?: boolean }) => {
      let resolved = next;
      if (!canAccessView(user, resolved)) {
        resolved = user ? 'home' : 'login';
      }
      if (user && resolved === 'login') {
        resolved = 'home';
      }

      setView(resolved);
      const targetPath = toPath(resolved);
      if (normalizePath(window.location.pathname) !== normalizePath(targetPath)) {
        const updater = options?.replace ? window.history.replaceState : window.history.pushState;
        updater.call(window.history, { view: resolved }, '', targetPath);
      }
    },
    [user]
  );

  useEffect(() => {
    const handlePopState = () => {
      let next = toView(window.location.pathname);
      if (!canAccessView(user, next)) {
        next = user ? 'home' : 'login';
      }
      if (user && next === 'login') {
        next = 'home';
      }
      setView(next);
      const canonicalPath = toPath(next);
      if (normalizePath(window.location.pathname) !== normalizePath(canonicalPath)) {
        window.history.replaceState({ view: next }, '', canonicalPath);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [user]);

  useEffect(() => {
    let next = view;
    if (!canAccessView(user, next)) {
      next = user ? 'home' : 'login';
    }
    if (user && next === 'login') {
      next = 'home';
    }
    if (next !== view) {
      navigateToView(next, { replace: true });
      return;
    }

    const expectedPath = toPath(next);
    if (normalizePath(window.location.pathname) !== normalizePath(expectedPath)) {
      window.history.replaceState({ view: next }, '', expectedPath);
    }
  }, [user, view, navigateToView]);

  const loadAttachments = useCallback(async (pollId: string) => {
    try {
      setAttachmentsLoading(true);
      const items = await PollApiService.listPollAttachments(pollId);
      setAttachments(items);
      setAttachmentsError(null);
    } catch (error) {
      console.error('Error loading poll attachments:', error);
      setAttachmentsError('Не удалось загрузить вложения');
    } finally {
      setAttachmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!currentPoll || !user || view !== 'poll') {
      setAttachments([]);
      setAttachmentsError(null);
      return;
    }
    loadAttachments(currentPoll.id);
  }, [currentPoll, user, view, loadAttachments]);

  const handleCreatePoll = async (pollData: PollCreate) => {
    try {
      setLoading(true);
      await PollApiService.createPoll(pollData);
      notify('Опрос создан', 'success');
      setPollListVersion((prev) => prev + 1);
      navigateToView('home');
    } catch (error) {
      console.error('Error creating poll:', error);
      notify('Ошибка при создании опроса', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePoll = (poll: Poll) => {
    requestConfirm({
      title: 'Удалить опрос?',
      description: `Опрос «${poll.title}» и все связанные данные будут удалены.`,
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        try {
          await PollApiService.deletePoll(poll.id);
          notify('Опрос удалён', 'success');
          setPollListVersion((prev) => prev + 1);
          if (currentPoll?.id === poll.id) {
            setCurrentPoll(null);
            setResults(null);
            navigateToView('home');
          }
        } catch (error) {
          console.error('Error deleting poll:', error);
          notify('Ошибка при удалении опроса', 'error');
        }
      },
    });
  };

  const handlePollSelect = (poll: Poll) => {
    if (!user) {
      navigateToView('login');
      return;
    }
    if (!canVote) {
      notify('У вас нет прав на голосование', 'error');
      return;
    }
    setCurrentPoll(poll);
    setSelectedChoices([]);
    navigateToView('poll');
  };

  const handleChoiceToggle = (variantId: string) => {
    if (!currentPoll) return;
    const isMulti = currentPoll.type === 'multi';
    const maxSelections = currentPoll.maxSelections ?? 1;

    setSelectedChoices((prev) => {
      if (isMulti) {
        if (prev.includes(variantId)) {
          return prev.filter((id) => id !== variantId);
        }
        if (prev.length >= maxSelections) {
          notify(`Можно выбрать максимум ${maxSelections}`, 'error');
          return prev;
        }
        return [...prev, variantId];
      }
      return [variantId];
    });
  };

  const handleResultsSelect = (poll: Poll) => {
    setCurrentPoll(poll);
    setSelectedChoices([]);
    void loadResults(poll);
  };

  const loadResults = async (pollOverride?: Poll) => {
    const pollForResults = pollOverride ?? currentPoll;
    if (!pollForResults) return;

    try {
      setLoading(true);
      const resultsData = await PollApiService.getResults(pollForResults.id);
      setResults(resultsData);
      setCurrentPoll(pollForResults);
      navigateToView('results');
    } catch (error) {
      console.error('Error loading results:', error);
      notify('Ошибка при загрузке результатов', 'error');
    } finally {
      setLoading(false);
    }
  };

  const requestVoteSubmit = () => {
    if (!currentPoll) return;

    if (isPollClosed(currentPoll)) {
      notify('Голосование завершено', 'error');
      return;
    }
    const isMulti = currentPoll.type === 'multi';
    const max = currentPoll.maxSelections ?? 1;
    if (!isMulti && selectedChoices.length !== 1) {
      notify('Выберите один вариант', 'error');
      return;
    }
    if (isMulti && selectedChoices.length > max) {
      notify(`Можно выбрать максимум ${max}`, 'error');
      return;
    }

    const selectedLabels = currentPoll.variants
      .filter((variant) => selectedChoices.includes(variant.id))
      .map((variant) => variant.label)
      .join(', ');

    requestConfirm({
      title: 'Подтвердить голос?',
      description: `Вы выбрали: ${selectedLabels}. ${currentPoll.isAnonymous ? 'Ваш голос анонимен.' : 'Это публичное голосование.'}`,
      confirmLabel: 'Подтвердить',
      onConfirm: handleVote,
    });
  };

  const handleVote = async () => {
    if (!currentPoll || selectedChoices.length === 0) return;
    try {
      setLoading(true);
      if (!user) {
        notify('Войдите, чтобы голосовать', 'error');
        return;
      }
      await PollApiService.vote(currentPoll.id, { choices: selectedChoices });
      setSelectedChoices([]);
      notify('Голос отправлен', 'success');
      navigateToView('success');
    } catch (error) {
      console.error('Error voting:', error);
      notify('Ошибка при голосовании', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAttachmentUpload = async (file: File) => {
    if (!currentPoll) return;
    try {
      setAttachmentUploading(true);
      await PollApiService.uploadPollAttachment(currentPoll.id, file);
      notify('Файл прикреплён', 'success');
      await loadAttachments(currentPoll.id);
    } catch (error) {
      console.error('Error uploading poll attachment:', error);
      notify('Не удалось загрузить файл', 'error');
    } finally {
      setAttachmentUploading(false);
    }
  };

  const handleAttachmentDelete = (attachmentId: string) => {
    if (!currentPoll) return;
    requestConfirm({
      title: 'Удалить файл?',
      description: 'Вложение будет удалено и перестанет быть доступным.',
      confirmLabel: 'Удалить',
      danger: true,
      onConfirm: async () => {
        try {
          await PollApiService.deletePollAttachment(currentPoll.id, attachmentId);
          setAttachments((prev) => prev.filter((item) => item.id !== attachmentId));
          notify('Файл удалён', 'success');
        } catch (error) {
          console.error('Error deleting poll attachment:', error);
          notify('Не удалось удалить файл', 'error');
        }
      },
    });
  };

  const publishedAt = useMemo(() => formatDate(new Date().toISOString()), []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 transition-colors dark:bg-gray-900 dark:text-gray-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        Перейти к содержимому
      </a>
      <AppBar onNav={navigateToView} current={view} />

      <main id="main-content" className="mx-auto w-full max-w-screen-md px-4 py-6">
        {view === 'login' && <LoginView onSuccess={() => navigateToView('home')} onNotify={notify} />}

        {view === 'home' && (
          <PollList
            key={`poll-list-${pollListVersion}`}
            onViewChange={navigateToView}
            onPollSelect={handlePollSelect}
            onResultsSelect={handleResultsSelect}
            onDeletePoll={handleDeletePoll}
          />
        )}

        {view === 'poll' && currentPoll && (
          <PollVotingView
            poll={currentPoll}
            selectedChoices={selectedChoices}
            loading={loading}
            pollClosed={pollClosed}
            canVote={canVote}
            attachments={attachments}
            attachmentsLoading={attachmentsLoading}
            attachmentsError={attachmentsError}
            canManageAttachments={canManageAttachments}
            attachmentUploading={attachmentUploading}
            formatDate={formatDate}
            onChoiceToggle={handleChoiceToggle}
            onOpenVoteConfirm={requestVoteSubmit}
            onUploadAttachment={handleAttachmentUpload}
            onDeleteAttachment={handleAttachmentDelete}
            onNotify={notify}
          />
        )}

        {view === 'success' && (
          <SuccessView
            publishedAtLabel={publishedAt}
            onShowResults={() => void loadResults()}
            onBackHome={() => navigateToView('home')}
          />
        )}

        {view === 'results' && currentPoll && results && (
          <DetailedResults results={results} pollTitle={currentPoll.title} onBack={() => navigateToView('home')} pollId={currentPoll.id} />
        )}

        {view === 'organizer' && (
          <section className="grid gap-4" aria-busy={loading}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">Создать опрос</h2>
                <p className="mt-0.5 text-sm text-gray-600">Поля и настройки</p>
              </div>
            </div>

            <PollCreator
              onCreatePoll={handleCreatePoll}
              onCancel={() => navigateToView('home')}
              onValidationError={(message) => notify(message, 'error')}
            />
          </section>
        )}

        {view === 'profile' && <ProfilePanel onBack={() => navigateToView('home')} />}

        {view === 'admin' && <AdminUserRolesPanel onBack={() => navigateToView('home')} onNotify={notify} />}
      </main>

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title ?? ''}
        description={confirmState?.description ?? ''}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => void runConfirmedAction()}
      />

      <ToastRegion toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
