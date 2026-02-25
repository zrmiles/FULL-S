import { Poll, User } from '../api/pollApi';
import { View } from '../types';

export type Permission =
  | 'users:role:manage'
  | 'profile:read'
  | 'profile:update'
  | 'profile:avatar:update'
  | 'polls:create'
  | 'polls:vote'
  | 'polls:delete:any'
  | 'polls:delete:own';

const ROLE_PERMISSIONS: Record<User['role'], ReadonlyArray<Permission>> = {
  admin: [
    'users:role:manage',
    'profile:read',
    'profile:update',
    'profile:avatar:update',
    'polls:create',
    'polls:vote',
    'polls:delete:any',
    'polls:delete:own',
  ],
  user: [
    'profile:read',
    'profile:update',
    'profile:avatar:update',
    'polls:create',
    'polls:vote',
    'polls:delete:own',
  ],
};

export function hasPermission(user: User | null, permission: Permission): boolean {
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role].includes(permission);
}

export function canDeletePoll(user: User | null, poll: Poll): boolean {
  if (!user) return false;
  if (hasPermission(user, 'polls:delete:any')) return true;
  return hasPermission(user, 'polls:delete:own') && poll.ownerUserId === user.id;
}

export function canAccessView(user: User | null, view: View): boolean {
  if (view === 'home' || view === 'login' || view === 'results') {
    return true;
  }
  if (!user) {
    return false;
  }
  if (view === 'organizer') {
    return hasPermission(user, 'polls:create');
  }
  if (view === 'poll' || view === 'success') {
    return hasPermission(user, 'polls:vote');
  }
  if (view === 'profile') {
    return hasPermission(user, 'profile:read');
  }
  if (view === 'admin') {
    return hasPermission(user, 'users:role:manage');
  }
  return true;
}
