import { useCallback, useEffect, useState } from 'react';
import { AuthApi, User, UserRole } from '../api/pollApi';
import { useAuth } from '../context/AuthContext';
import { ConfirmDialog } from './ui/ConfirmDialog';
import type { ToastKind } from './ui/ToastRegion';

interface AdminUserRolesPanelProps {
  onBack: () => void;
  onNotify?: (message: string, kind?: ToastKind) => void;
}

export function AdminUserRolesPanel({ onBack, onNotify }: AdminUserRolesPanelProps): JSX.Element {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [pendingDeleteUser, setPendingDeleteUser] = useState<User | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const items = await AuthApi.listUsers();
      setUsers(items);
      setError(null);
    } catch (err) {
      console.error('Failed to load users', err);
      setError('Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const updateRole = async (userId: string, role: UserRole) => {
    try {
      setSavingUserId(userId);
      const updated = await AuthApi.updateUserRole(userId, role);
      setUsers((prev) => prev.map((user) => (user.id === updated.id ? updated : user)));
    } catch (err) {
      console.error('Failed to update role', err);
      onNotify?.('Не удалось изменить роль пользователя', 'error');
    } finally {
      setSavingUserId(null);
    }
  };

  const deleteUser = async () => {
    if (!pendingDeleteUser) {
      return;
    }
    try {
      setSavingUserId(pendingDeleteUser.id);
      await AuthApi.deleteUser(pendingDeleteUser.id);
      setUsers((prev) => prev.filter((item) => item.id !== pendingDeleteUser.id));
      onNotify?.('Пользователь удалён', 'success');
    } catch (err) {
      console.error('Failed to delete user', err);
      onNotify?.('Не удалось удалить пользователя', 'error');
    } finally {
      setSavingUserId(null);
      setPendingDeleteUser(null);
    }
  };

  return (
    <section className="grid gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-bold">Управление ролями</h2>
          <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-400">
            Только для администраторов
          </p>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-500" role="status" aria-live="polite">
          Загрузка пользователей...
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-700 dark:bg-gray-900">
                <th className="px-4 py-3 font-medium">Пользователь</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">Роль</th>
                <th className="px-4 py-3 font-medium">Действие</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-gray-100 dark:border-gray-700">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{user.name}</div>
                    <div className="text-xs text-gray-500">@{user.username ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{user.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      disabled={savingUserId === user.id}
                      onChange={(event) => updateRole(user.id, event.target.value as UserRole)}
                      className="rounded-lg border border-gray-300 px-2 py-1 dark:border-gray-600 dark:bg-gray-900"
                    >
                      <option value="user">user</option>
                      <option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={savingUserId === user.id || currentUser?.id === user.id}
                      onClick={() => setPendingDeleteUser(user)}
                      className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600 disabled:opacity-50 dark:border-red-600 dark:text-red-300"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
        >
          Назад
        </button>
      </div>

      <ConfirmDialog
        open={!!pendingDeleteUser}
        title="Удалить пользователя?"
        description={pendingDeleteUser ? `Пользователь ${pendingDeleteUser.name} будет удалён без возможности восстановления.` : ''}
        confirmLabel="Удалить"
        danger
        onCancel={() => setPendingDeleteUser(null)}
        onConfirm={deleteUser}
      />
    </section>
  );
}
