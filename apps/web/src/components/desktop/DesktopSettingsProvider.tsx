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
import { NS_DESKTOP_SETTINGS } from '@zm/core';
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

/**
 * 설정 항목마다 액션을 만들면 저장 시 나머지 필드를 손으로 재조립하게 되고,
 * 새 항목이 늘 때마다 그 조립부를 빠뜨려 값이 유실된다.
 * 부분 갱신 하나로 통일해 그 실수가 구조적으로 불가능하게 한다.
 */
export type DesktopSettingsPatch = Partial<State>;

export type DesktopSettingsAction =
  | { type: 'HYDRATE'; settings: DesktopSettingsRecord }
  | { type: 'PATCH'; patch: DesktopSettingsPatch };

/** 테스트를 위해 export한다 — 병합 규칙이 유실 방지의 핵심이다. */
export function desktopSettingsReducer(state: State, action: DesktopSettingsAction): State {
  switch (action.type) {
    case 'HYDRATE':
      // 저장 레코드에서 상태 필드만 취한다(savedAt 등 메타 제외).
      return { wallpaper: action.settings.wallpaper, themeMode: action.settings.themeMode };
    case 'PATCH':
      return { ...state, ...action.patch };
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
  const [state, dispatch] = useReducer(desktopSettingsReducer, {
    wallpaper: DEFAULT_SETTINGS.wallpaper,
    themeMode: DEFAULT_SETTINGS.themeMode,
  });

  const resolvedTheme = useResolvedTheme(state.themeMode);
  useDarkModeClass(resolvedTheme);

  const stateRef = useRef(state);
  stateRef.current = state;

  const { writable, persistAsync } = usePersistence<DesktopSettingsRecord | undefined>({
    namespace: NS_DESKTOP_SETTINGS,
    loadFn: loadDesktopSettings,
    onHydrate: (record) => {
      if (record !== undefined) dispatch({ type: 'HYDRATE', settings: record });
    },
  });

  const writableRef = useRef(writable);
  writableRef.current = writable;

  /**
   * 부분 갱신 하나로 모든 설정 변경을 처리한다.
   *
   * 저장은 반드시 현재 상태 전체 위에 patch를 얹어 만든다. 필드를 손으로 나열하면
   * 새 설정이 늘 때 빠뜨리게 되고, 그 필드는 저장 시점에 조용히 사라진다.
   * hydration 전·실패 시에는 저장하지 않는다 — 그때 상태는 저장된 값이 아니라
   * 기본값이라, 한 항목만 바꿔도 나머지가 기본값으로 덮어써진다.
   */
  const updateSettings = useCallback(
    (patch: DesktopSettingsPatch): void => {
      dispatch({ type: 'PATCH', patch });
      if (!writableRef.current) return;
      persistAsync('persist', () =>
        saveDesktopSettings({ ...stateRef.current, ...patch, savedAt: Date.now() }),
      );
    },
    [persistAsync],
  );

  const setWallpaper = useCallback(
    (config: WallpaperConfig): void => updateSettings({ wallpaper: config }),
    [updateSettings],
  );

  const setThemeMode = useCallback(
    (mode: ThemeMode): void => updateSettings({ themeMode: mode }),
    [updateSettings],
  );

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
