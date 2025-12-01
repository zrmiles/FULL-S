import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AuthApi, ProfileUpdatePayload, User } from '../api/pollApi';

type AuthContextType = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  fetchProfile: () => Promise<User>;
  updateProfile: (payload: ProfileUpdatePayload) => Promise<User>;
  uploadAvatar: (file: File) => Promise<User>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('auth:user');
    if (raw) {
      try { setUser(JSON.parse(raw)); } catch {}
    }
  }, []);

  const persistUser = useCallback((u: User | null) => {
    setUser(u);
    if (u) {
      localStorage.setItem('auth:user', JSON.stringify(u));
    } else {
      localStorage.removeItem('auth:user');
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const u = await AuthApi.login(username, password);
    persistUser(u);
  }, [persistUser]);

  const register = useCallback(async (username: string, email: string, name: string, password: string) => {
    const u = await AuthApi.register(username, email, name, password);
    persistUser(u);
  }, [persistUser]);

  const logout = useCallback(() => {
    persistUser(null);
  }, [persistUser]);

  const fetchProfile = useCallback(async () => {
    const profile = await AuthApi.getProfile();
    persistUser(profile);
    return profile;
  }, [persistUser]);

  const updateProfile = useCallback(async (payload: ProfileUpdatePayload) => {
    const updated = await AuthApi.updateProfile(payload);
    persistUser(updated);
    return updated;
  }, [persistUser]);

  const uploadAvatar = useCallback(async (file: File) => {
    const updated = await AuthApi.uploadAvatar(file);
    persistUser(updated);
    return updated;
  }, [persistUser]);

  const value = useMemo(
    () => ({ user, login, logout, register, fetchProfile, updateProfile, uploadAvatar }),
    [user, login, logout, register, fetchProfile, updateProfile, uploadAvatar]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// функкция авторизации пользователя
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
