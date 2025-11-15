import { useEffect, useState, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { ShieldCheck, UserCircle2, Sun, Moon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface ProfilePanelProps {
  onBack: () => void;
}

export function ProfilePanel({ onBack }: ProfilePanelProps): JSX.Element {
  const { user, fetchProfile, updateProfile, uploadAvatar } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

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
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCropImageSrc(reader.result as string);
      setCropModalOpen(true);
      setZoom(1);
      setCrop({ x: 0, y: 0 });
    };
    reader.readAsDataURL(file);
    setPendingFile(file);
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

  const onCropComplete = useCallback((_: Area, croppedArea: Area) => {
    setCroppedAreaPixels(croppedArea);
  }, []);

  const handleCropCancel = () => {
    setCropModalOpen(false);
    setCropImageSrc(null);
    setPendingFile(null);
    setCroppedAreaPixels(null);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const handleCropSave = useCallback(async () => {
    if (!cropImageSrc || !croppedAreaPixels) return;
    try {
      const blob = await getCroppedBlob(cropImageSrc, croppedAreaPixels);
      const fileName = pendingFile?.name ?? 'avatar.jpg';
      const croppedFile = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
      if (tempAvatarUrl) {
        URL.revokeObjectURL(tempAvatarUrl);
      }
      const previewUrl = URL.createObjectURL(croppedFile);
      setTempAvatarUrl(previewUrl);
      setAvatarPreview(previewUrl);
      setAvatarFile(croppedFile);
      setCropModalOpen(false);
      setCropImageSrc(null);
      setPendingFile(null);
    } catch (err) {
      console.error('Failed to crop image', err);
      setStatus('Не удалось обрезать изображение');
    }
  }, [cropImageSrc, croppedAreaPixels, pendingFile, tempAvatarUrl]);

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
    <>
    <section className="mx-auto max-w-lg rounded-2xl bg-white p-6 shadow-sm dark:bg-gray-800 dark:text-gray-100">
      {initializing && (
        <div className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-900/30 dark:text-blue-200">
          Загрузка профиля...
        </div>
      )}
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-900/30 dark:text-blue-200">
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
          <span className="text-sm text-gray-600 dark:text-gray-300">Никнейм</span>
          <input
            value={user.username ?? ''}
            disabled
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-gray-500 dark:border-gray-700 dark:bg-gray-900"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">Имя</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">E-mail</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2"
          />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-gray-600 dark:text-gray-300">Новый пароль</span>
          <input
            type="password"
            value={password}
            placeholder="Оставьте пустым, чтобы не менять"
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2"
          />
        </label>
        <div className="rounded-xl bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-900 dark:text-gray-300">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-green-600" />
            <span>Данные передаются по защищенному соединению</span>
          </div>
        </div>
        {status && <p className="text-sm text-gray-500">{status}</p>}
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-600">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Тема интерфейса</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Переключение светлой и тёмной темы</p>
            </div>
            <button
              onClick={toggleTheme}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4" /> Светлая
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" /> Тёмная
                </>
              )}
            </button>
          </div>
        </div>
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

    {cropModalOpen && cropImageSrc && (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
        <div className="w-full max-w-xl rounded-2xl bg-white p-4 shadow-xl dark:bg-gray-900 dark:text-gray-100">
          <h3 className="mb-4 text-lg font-semibold">Выберите область аватара</h3>
          <div className="relative h-72 w-full overflow-hidden rounded-2xl bg-gray-900">
            <Cropper
              image={cropImageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-300">Масштаб</label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              className="rounded-xl border border-gray-200 px-4 py-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              onClick={handleCropCancel}
            >
              Отмена
            </button>
            <button
              className="rounded-xl bg-[#3C2779] px-4 py-2 text-white hover:bg-[#2A1B5A]"
              onClick={handleCropSave}
            >
              Сохранить
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });
}

async function getCroppedBlob(imageSrc: string, crop: Area): Promise<Blob> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = crop.width;
  canvas.height = crop.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas not available');
  }
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Canvas is empty'));
      }
    }, 'image/jpeg');
  });
}
