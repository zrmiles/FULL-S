import React from 'react';
import { LogIn } from 'lucide-react';
import logo from '../assets/mtuci-logo.png';
import { AppBarProps, NavBtnProps } from '../types';
import { useAuth } from '../context/AuthContext';

export function AppBar({ onNav, current }: AppBarProps): JSX.Element {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-screen-2xl flex-wrap items-center justify-between gap-4 px-6 sm:px-10">
        <div className="flex items-center gap-3 pl-2 sm:pl-6">
          <img
            src={logo}
            alt="MTUCI"
            className="h-11 w-11 flex-shrink-0"
          />
          <span className="text-base font-semibold">MTUCI — честные голосования</span>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <NavBtn active={current === "home"} onClick={() => onNav("home")}>
            Опросы
          </NavBtn>
          <NavBtn active={current === "organizer"} onClick={() => onNav("organizer")}>
            Организатор
          </NavBtn>
          <NavBtn active={current === "results"} onClick={() => onNav("results")}>
            Результаты
          </NavBtn>
          {user && (
            <NavBtn active={current === "profile"} onClick={() => onNav("profile")}>
              Профиль
            </NavBtn>
          )}
          {!user && (
            <button
              aria-label="Войти"
              className="rounded-full border border-gray-200 p-2 hover:bg-gray-50"
              onClick={() => onNav("login")}
            >
              <LogIn className="h-4 w-4 text-gray-600" />
            </button>
          )}
          {user && (
            <span className="ml-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-2 py-1">
              <span className="text-gray-600 text-sm">{user.name}</span>
              <button className="text-xs text-gray-500 hover:text-gray-700" onClick={logout}>Выйти</button>
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
        active ? "bg-gray-100" : "hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}
