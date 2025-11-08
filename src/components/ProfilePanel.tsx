import { useEffect, useState } from 'react';
import { ShieldCheck, UserCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface ProfilePanelProps {
  onBack: () => void;
}

export function ProfilePanel({ onBack }: ProfilePanelProps): JSX.Element {
  const { user, fetchProfile, updateProfile, uploadAvatar } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatarUrl ?? null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [tempAvatarUrl, setTempAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        setInitializing(true);
        const profile = await fetchProfile();
        if (!active) return;
        setName(profile.name);
        setEmail(profile.email);
        setAvatarPreview(profile.avatarUrl ?? null);
      } catch (err) {
        console.error('Failed to load profile', err);
        setStatus('Не удалось загрузить профиль');
      } finally {
        if (active) setInitializing(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [fetchProfile]);

  useEffect(() => {
    if (!avatarFile) {
      setAvatarPreview(user?.avatarUrl ?? null);
    }
  }, [user?.avatarUrl, avatarFile]);

  useEffect(() => {
    return () => {
      if (tempAvatarUrl) {
        URL.revokeObjectURL(tempAvatarUrl);
      }
    };
  }, [tempAvatarUrl]);

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setAvatarFile(file);
    if (tempAvatarUrl) {
      URL.revokeObjectURL(tempAvatarUrl);
      setTempAvatarUrl(null);
    }
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      setAvatarPreview(objectUrl);
      setTempAvatarUrl(objectUrl);
    } else {
      setAvatarPreview(user?.avatarUrl ?? null);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setStatus('Выберите файл для загрузки');
      return;
    }
    setStatus(null);
    try {
      setAvatarUploading(true);
      const updated = await uploadAvatar(avatarFile);
      setAvatarPreview(updated.avatarUrl ?? null);
      setAvatarFile(null);
      if (tempAvatarUrl) {
        URL.revokeObjectURL(tempAvatarUrl);
        setTempAvatarUrl(null);
      }
      setStatus('Аватар обновлён');
    } catch (err) {
      console.error('Failed to upload avatar', err);
      setStatus('Не удалось загрузить аватар');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) {
      setStatus('Имя и e-mail обязательны');
      return;
    }
    setStatus(null);
    try {
      setSaving(true);
      const payload: { email?: string; name?: string; password?: string } = {};
      if (email.trim()) payload.email = email.trim();
      if (name.trim()) payload.name = name.trim();
      if (password) payload.password = password;
      const updated = await updateProfile(payload);
      setName(updated.name);
      setEmail(updated.email);
      setPassword('');
      setStatus('Сохранено');
    } catch (err) {
      console.error('Failed to update profile', err);
      setStatus('Не удалось сохранить изменения');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <section className="mx-auto max-w-md rounded-2xl bg-white p-6 text-center shadow-sm">
        <p className="text-gray-600">Авторизуйтесь, чтобы просмотреть профиль.</p>
        <button className="mt-4 rounded-xl border border-gray-200 px-4 py-2" onClick={onBack}>
          На главную
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm">
      {initializing && (
        <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">
          Загрузка профиля...
        </div>
      )}
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
          <UserCircle2 className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Профиль</h2>
          <p className="text-sm text-gray-500">Редактирование личных данных</p>
        </div>
      </div>
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {avatarPreview ? (
            <img
              src={avatarPreview}
              alt="Аватар"
              className="h-20 w-20 rounded-full border border-gray-200 object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-200 text-xl font-semibold text-gray-600">
              {(user.name || user.username || '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="space-y-2 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50">
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleAvatarChange} />
              Выбрать файл
            </label>
            <button
              onClick={handleAvatarUpload}
              disabled={!avatarFile || avatarUploading}
              className="rounded-lg bg-[#3C2779] px-3 py-2 text-white disabled:bg-[#3C2779]/60"
            >
              {avatarUploading ? 'Загрузка...' : 'Загрузить аватар'}
            </button>
            <p className="text-xs text-gray-500">Форматы: JPG или PNG</p>
          </div>
        </div>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600">Никнейм</span>
          <input
            value={user.username ?? ''}
            disabled
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600">Имя</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600">E-mail</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600">Новый пароль</span>
          <input
            type="password"
            value={password}
            placeholder="Оставьте пустым, чтобы не менять"
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2"
          />
        </label>
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>Данные передаются по защищенному соединению</span>
          </div>
        </div>
        {status && <p className="text-sm text-gray-500">{status}</p>}
        <div className="flex justify-between">
          <button className="rounded-xl border border-gray-200 px-4 py-2" onClick={onBack}>
            Назад
          </button>
          <button
            onClick={handleSave}
            disabled={saving || initializing}
            className="rounded-xl bg-[#3C2779] px-4 py-2 text-white disabled:opacity-50 disabled:bg-[#3C2779]/60 hover:bg-[#2A1B5A]"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </section>
  );
}
