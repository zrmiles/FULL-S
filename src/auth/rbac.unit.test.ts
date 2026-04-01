import { describe, expect, it } from 'vitest';
import { canAccessView, canDeletePoll, hasPermission } from './rbac';
import { Poll, User } from '../api/pollApi';

const adminUser: User = {
  id: 'admin-1',
  email: 'admin@example.com',
  name: 'Администратор',
  role: 'admin',
  username: 'admin',
};

const regularUser: User = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Пользователь',
  role: 'user',
  username: 'user',
};

const ownedPoll: Poll = {
  id: 'poll-1',
  title: 'Опрос',
  description: 'Описание',
  type: 'single',
  variants: [{ id: 'v1', label: 'Да' }, { id: 'v2', label: 'Нет' }],
  maxSelections: 1,
  isAnonymous: true,
  ownerUserId: 'user-1',
};

describe('rbac', () => {
  it('grants admin-only permissions only to admins', () => {
    expect(hasPermission(adminUser, 'users:role:manage')).toBe(true);
    expect(hasPermission(regularUser, 'users:role:manage')).toBe(false);
  });

  it('allows users to delete only their own polls unless admin', () => {
    expect(canDeletePoll(adminUser, ownedPoll)).toBe(true);
    expect(canDeletePoll(regularUser, ownedPoll)).toBe(true);
    expect(
      canDeletePoll(regularUser, {
        ...ownedPoll,
        ownerUserId: 'other-user',
      })
    ).toBe(false);
  });

  it('protects private views from anonymous users and admin view from regular users', () => {
    expect(canAccessView(null, 'profile')).toBe(false);
    expect(canAccessView(null, 'home')).toBe(true);
    expect(canAccessView(regularUser, 'admin')).toBe(false);
    expect(canAccessView(adminUser, 'admin')).toBe(true);
    expect(canAccessView(regularUser, 'organizer')).toBe(true);
  });
});
