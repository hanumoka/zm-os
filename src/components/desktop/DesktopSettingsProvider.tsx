'use client';

import React, { createContext, useContext, useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  loadDesktopSettings,
  saveDesktopSettings,
  DEFAULT_SETTINGS,
} from '@/lib/storage/desktop-settings';
import type {
  WallpaperConfig,
  ThemeMode,
  ResolvedTheme,
  DesktopSettingsRecord,
} from '@/lib/storage/desktop-settings';
import { NS_DESKTOP_SETTINGS } from '@/lib/storage/namespace-registry';
import { usePersistence } from '@/lib/storage/use-persistence';

// ─── Context Value 타입 ────────────────────────────────────────────────────────

export type DesktopSettingsContextValue = {
  wallpaper: WallpaperConfig;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setWallpaper: (config: WallpaperConfig) => void;
  setThemeMode: (mode: ThemeMode) => void;
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type State = {
  wallpaper: WallpaperConfig;
  themeMode: ThemeMode;
};

type Action =
  | { type: 'HYDRATE'; settings: DesktopSettingsRecord }
  | { type: 'SET_WALLPAPER'; config: WallpaperConfig }
  | { type: 'SET_THEME'; mode: ThemeMode };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE':
      return { wallpaper: action.settings.wallpaper, themeMode: action.settings.themeMode };
    case 'SET_WALLPAPER':
      return { ...state, wallpaper: action.config };
    case 'SET_THEME':
      return { ...state, themeMode: action.mode };
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DesktopSettingsContext = createContext<DesktopSettingsContextValue | null>(null);

// ─── resolvedTheme 헬퍼 ───────────────────────────────────────────────────────
// system일 때 prefers-color-scheme 참조

function useResolvedTheme(themeMode: ThemeMode): ResolvedTheme {
  const [systemDark, setSystemDark] = React.useState(false);

  useEffect(() => {
    if (themeMode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemDark(mq.matches);
    const handler = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themeMode]);

  if (themeMode === 'light') return 'light';
  if (themeMode === 'dark') return 'dark';
  return systemDark ? 'dark' : 'light';
}

// ─── <html> class 동기화 ──────────────────────────────────────────────────────

function useDarkModeClass(resolved: ResolvedTheme): void {
  useEffect(() => {
    const el = document.documentElement;
    if (resolved === 'dark') {
      el.classList.add('dark');
    } else {
      el.classList.remove('dark');
    }
  }, [resolved]);
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DesktopSettingsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [state, dispatch] = useReducer(reducer, {
    wallpaper: DEFAULT_SETTINGS.wallpaper,
    themeMode: DEFAULT_SETTINGS.themeMode,
  });

  const resolvedTheme = useResolvedTheme(state.themeMode);
  useDarkModeClass(resolvedTheme);

  const stateRef = useRef(state);
  stateRef.current = state;

  const { persistAsync } = usePersistence<DesktopSettingsRecord | undefined>({
    namespace: NS_DESKTOP_SETTINGS,
    loadFn: loadDesktopSettings,
    onHydrate: (record) => {
      if (record !== undefined) dispatch({ type: 'HYDRATE', settings: record });
    },
  });

  const setWallpaper = useCallback((config: WallpaperConfig): void => {
    dispatch({ type: 'SET_WALLPAPER', config });
    persistAsync('persist', () => saveDesktopSettings({
      wallpaper: config,
      themeMode: stateRef.current.themeMode,
      savedAt: Date.now(),
    }));
  }, [persistAsync]);

  const setThemeMode = useCallback((mode: ThemeMode): void => {
    dispatch({ type: 'SET_THEME', mode });
    persistAsync('persist', () => saveDesktopSettings({
      wallpaper: stateRef.current.wallpaper,
      themeMode: mode,
      savedAt: Date.now(),
    }));
  }, [persistAsync]);

  const value = useMemo<DesktopSettingsContextValue>(
    () => ({
      wallpaper: state.wallpaper,
      themeMode: state.themeMode,
      resolvedTheme,
      setWallpaper,
      setThemeMode,
    }),
    [state.wallpaper, state.themeMode, resolvedTheme, setWallpaper, setThemeMode],
  );

  return (
    <DesktopSettingsContext.Provider value={value}>
      {children}
    </DesktopSettingsContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDesktopSettings(): DesktopSettingsContextValue {
  const ctx = useContext(DesktopSettingsContext);
  if (ctx === null) {
    throw new Error('useDesktopSettings: DesktopSettingsProvider 하위에서 호출해야 합니다.');
  }
  return ctx;
}
