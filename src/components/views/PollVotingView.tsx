import { useState } from 'react';
import { Clock, ShieldCheck } from 'lucide-react';
import { Poll, PollAttachment } from '../../api/pollApi';
import type { ToastKind } from '../ui/ToastRegion';

const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'text/plain',
]);

interface PollVotingViewProps {
  poll: Poll;
  selectedChoices: string[];
  loading: boolean;
  pollClosed: boolean;
  canVote: boolean;
  attachments: PollAttachment[];
  attachmentsLoading: boolean;
  attachmentsError: string | null;
  canManageAttachments: boolean;
  attachmentUploading: boolean;
  formatDate: (iso: string) => string;
  onChoiceToggle: (variantId: string) => void;
  onOpenVoteConfirm: () => void;
  onUploadAttachment: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => void;
  onNotify: (message: string, kind?: ToastKind) => void;
}

export function PollVotingView({
  poll,
  selectedChoices,
  loading,
  pollClosed,
  canVote,
  attachments,
  attachmentsLoading,
  attachmentsError,
  canManageAttachments,
  attachmentUploading,
  formatDate,
  onChoiceToggle,
  onOpenVoteConfirm,
  onUploadAttachment,
  onDeleteAttachment,
  onNotify,
}: PollVotingViewProps): JSX.Element {
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  return (
    <section className="grid gap-4" aria-busy={loading}>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Clock className="h-5 w-5" aria-hidden="true" /> {poll.title}
          </h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
            Дедлайн: {poll.deadlineISO ? formatDate(poll.deadlineISO) : 'Не указан'}
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-5 shadow-sm dark:bg-gray-800 dark:text-gray-100">
        <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">{poll.description || 'Описание отсутствует'}</p>
        <AnonymityHint isAnonymous={poll.isAnonymous} />

        <div className="mt-4 rounded-xl border border-gray-200 p-3 dark:border-gray-700" aria-live="polite">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Вложения к опросу</span>
            {attachmentsLoading && <span className="text-xs text-gray-500">Загрузка...</span>}
          </div>
          {attachmentsError && <p className="mb-2 text-xs text-red-500">{attachmentsError}</p>}
          {attachments.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">Файлы не прикреплены</p>
          ) : (
            <div className="grid gap-2">
              {attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 dark:border-gray-700"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm text-gray-800 dark:text-gray-100">{attachment.originalName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatAttachmentSize(attachment.sizeBytes)} • {new Date(attachment.createdAt).toLocaleString('ru-RU')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={attachment.downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-gray-200 px-2 py-1 text-xs hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      Скачать
                    </a>
                    {canManageAttachments && (
                      <button
                        onClick={() => onDeleteAttachment(attachment.id)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-300 dark:hover:bg-red-900/30"
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {canManageAttachments && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="file"
                aria-label="Выбрать файл вложения"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) {
                    setAttachmentFile(null);
                    return;
                  }
                  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) {
                    onNotify('Недопустимый тип файла', 'error');
                    event.target.value = '';
                    setAttachmentFile(null);
                    return;
                  }
                  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
                    onNotify('Файл больше 10MB', 'error');
                    event.target.value = '';
                    setAttachmentFile(null);
                    return;
                  }
                  setAttachmentFile(file);
                }}
                className="rounded-lg border border-gray-200 px-2 py-1 text-xs dark:border-gray-700 dark:bg-gray-900"
              />
              <button
                onClick={async () => {
                  if (!attachmentFile) {
                    onNotify('Выберите файл для загрузки', 'error');
                    return;
                  }
                  await onUploadAttachment(attachmentFile);
                  setAttachmentFile(null);
                }}
                disabled={!attachmentFile || attachmentUploading}
                className="rounded-lg bg-[#3C2779] px-3 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {attachmentUploading ? 'Загрузка...' : 'Прикрепить файл'}
              </button>
              <span className="text-xs text-gray-500">Допустимо: PDF, DOC, DOCX, PNG, JPG, TXT до 10MB</span>
            </div>
          )}
        </div>

        <fieldset className="mt-4 grid gap-2" aria-label="Варианты ответа">
          {poll.variants.map((variant) => {
            const isSelected = selectedChoices.includes(variant.id);
            const isMulti = poll.type === 'multi';
            return (
              <label
                key={variant.id}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 ${
                  isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : ''
                }`}
              >
                <input
                  type={isMulti ? 'checkbox' : 'radio'}
                  name="vote"
                  value={variant.id}
                  checked={isSelected}
                  onChange={() => onChoiceToggle(variant.id)}
                  className="h-4 w-4 accent-blue-600"
                />
                <span>{variant.label}</span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-4 flex items-center justify-between gap-3">
          <small className="text-xs text-gray-500 dark:text-gray-300">
            Тип: {poll.type === 'single' ? 'один вариант' : 'несколько вариантов'}, 1 голос на пользователя
            {poll.deadlineISO && (
              <>
                <br />
                Дедлайн (МСК): {formatDate(poll.deadlineISO)}
              </>
            )}
          </small>
          <button
            disabled={selectedChoices.length === 0 || loading || pollClosed || !canVote}
            onClick={onOpenVoteConfirm}
            className="inline-flex items-center gap-2 rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A] disabled:cursor-not-allowed disabled:bg-[#3C2779]/60 disabled:opacity-50"
          >
            {pollClosed ? 'Опрос завершён' : loading ? 'Отправка...' : 'Отправить голос'}
          </button>
        </div>
      </div>
    </section>
  );
}

function AnonymityHint({ isAnonymous }: { isAnonymous: boolean }): JSX.Element {
  return (
    <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900/30 dark:text-gray-300">
      <ShieldCheck className="mt-0.5 h-4 w-4 text-green-600" aria-hidden="true" />
      {isAnonymous ? (
        <p>
          Ваш выбор <span className="font-medium text-gray-900 dark:text-gray-100">анонимен</span>. Система хранит только факт участия и
          проверяет уникальность голоса.
        </p>
      ) : (
        <p>
          Это <span className="font-medium text-gray-900 dark:text-gray-100">публичное голосование</span>. Организатор может видеть, кто
          выбрал каждый вариант.
        </p>
      )}
    </div>
  );
}

function formatAttachmentSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${Math.round(sizeBytes / 1024)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
