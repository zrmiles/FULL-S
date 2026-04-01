import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PollVotingView } from './PollVotingView';

const poll = {
  id: 'poll-1',
  title: 'Публичный опрос кафедры',
  description: 'Описание',
  deadlineISO: '2026-03-25T10:00:00.000Z',
  type: 'multi' as const,
  variants: [
    { id: 'v1', label: 'Вариант 1' },
    { id: 'v2', label: 'Вариант 2' },
  ],
  maxSelections: 2,
  isAnonymous: false,
  ownerUserId: 'admin-1',
};

describe('PollVotingView', () => {
  it('rejects unsupported attachment types before upload', async () => {
    const onNotify = vi.fn();
    const user = userEvent.setup();

    render(
      <PollVotingView
        poll={poll}
        selectedChoices={[]}
        loading={false}
        pollClosed={false}
        canVote={true}
        attachments={[]}
        attachmentsLoading={false}
        attachmentsError={null}
        canManageAttachments={true}
        attachmentUploading={false}
        formatDate={() => '25.03 13:00'}
        onChoiceToggle={vi.fn()}
        onOpenVoteConfirm={vi.fn()}
        onUploadAttachment={vi.fn()}
        onDeleteAttachment={vi.fn()}
        onNotify={onNotify}
      />
    );

    const fileInput = screen.getByLabelText('Выбрать файл вложения');
    await user.upload(fileInput, new File(['bad'], 'malware.exe', { type: 'application/x-msdownload' }));

    expect(onNotify).toHaveBeenCalledWith('Недопустимый тип файла', 'error');
    expect(screen.getByRole('button', { name: 'Прикрепить файл' })).toBeDisabled();
  });

  it('uploads a valid attachment through the provided callback', async () => {
    const onUploadAttachment = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <PollVotingView
        poll={poll}
        selectedChoices={['v1']}
        loading={false}
        pollClosed={false}
        canVote={true}
        attachments={[]}
        attachmentsLoading={false}
        attachmentsError={null}
        canManageAttachments={true}
        attachmentUploading={false}
        formatDate={() => '25.03 13:00'}
        onChoiceToggle={vi.fn()}
        onOpenVoteConfirm={vi.fn()}
        onUploadAttachment={onUploadAttachment}
        onDeleteAttachment={vi.fn()}
        onNotify={vi.fn()}
      />
    );

    const fileInput = screen.getByLabelText('Выбрать файл вложения');
    const button = screen.getByRole('button', { name: 'Прикрепить файл' });

    await user.upload(fileInput, new File(['hello'], 'report.txt', { type: 'text/plain' }));
    await user.click(button);

    expect(onUploadAttachment).toHaveBeenCalledTimes(1);
    expect(onUploadAttachment.mock.calls[0][0]).toBeInstanceOf(File);
  });

  it('disables vote submission for closed polls', () => {
    render(
      <PollVotingView
        poll={poll}
        selectedChoices={['v1']}
        loading={false}
        pollClosed={true}
        canVote={true}
        attachments={[]}
        attachmentsLoading={false}
        attachmentsError={null}
        canManageAttachments={false}
        attachmentUploading={false}
        formatDate={() => '25.03 13:00'}
        onChoiceToggle={vi.fn()}
        onOpenVoteConfirm={vi.fn()}
        onUploadAttachment={vi.fn()}
        onDeleteAttachment={vi.fn()}
        onNotify={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Опрос завершён' })).toBeDisabled();
  });
});
