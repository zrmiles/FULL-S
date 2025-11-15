import React from 'react';
import { LogIn } from 'lucide-react';
import logo from '../assets/mtuci-logo.svg';
import { AppBarProps, NavBtnProps } from '../types';
import { useAuth } from '../context/AuthContext';

export function AppBar({ onNav, current }: AppBarProps): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-6 sm:px-10">
        <div className="flex items-center gap-3 pl-2 sm:pl-6">
          <img
            src={logo}
            alt="MTUCI"
            className="h-11 w-auto flex-shrink-0 object-contain"
          />
          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">MTUCI — честные голосования</span>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <NavBtn active={current === "home"} onClick={() => onNav("home")}>
            Опросы
          </NavBtn>
          <NavBtn active={current === "organizer"} onClick={() => onNav("organizer")}>
            Новый опрос
          </NavBtn>
          {user && (
            <NavBtn active={current === "profile"} onClick={() => onNav("profile")}>
              Профиль
            </NavBtn>
          )}
          {!user && (
            <button
              aria-label="Войти"
              className="rounded-full border border-gray-200 p-2 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
              onClick={() => onNav("login")}
            >
              <LogIn className="h-4 w-4 text-gray-600 dark:text-gray-300" />
            </button>
          )}
          {user && (
            <span className="ml-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1 dark:border-gray-700">
              <span className="text-gray-600 text-sm dark:text-gray-200">{user.name}</span>
              <button className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100" onClick={logout}>Выйти</button>
            </span>
          )}
        </nav>
      </div>
    </header>
  );
}

function NavBtn({ active, children, onClick }: NavBtnProps): JSX.Element {
  return (
    <button 
      onClick={onClick} 
      className={`rounded-lg px-3 py-1.5 transition ${
        active ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-800"
      }`}
    >
      {children}
    </button>
  );
}
