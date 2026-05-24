'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useMemo,
} from 'react';

// ─── Context Value 타입 ───────────────────────────────────────────────────────

export type InstalledAppsContextValue = {
  /** 현재 설치된 앱 ID 집합 (ReadonlySet — 직접 변경 불가) */
  installedIds: ReadonlySet<string>;
  /** id가 설치된 앱인지 확인 */
  isInstalled: (id: string) => boolean;
  /** 앱을 설치 목록에 추가 */
  install: (id: string) => void;
  /** 앱을 설치 목록에서 제거 */
  uninstall: (id: string) => void;
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type InstalledAppsAction =
  | { type: 'INSTALL'; id: string }
  | { type: 'UNINSTALL'; id: string };

/**
 * immutable Set reducer.
 * 이미 존재하는 id install → 동일 참조 반환 (re-render 방지).
 * 존재하지 않는 id uninstall → 동일 참조 반환.
 */
function installedAppsReducer(
  state: ReadonlySet<string>,
  action: InstalledAppsAction,
): ReadonlySet<string> {
  if (action.type === 'INSTALL') {
    if (state.has(action.id)) {
      // 이미 존재 — 동일 참조 반환 (re-render 방지)
      return state;
    }
    const next = new Set(state);
    next.add(action.id);
    return next as ReadonlySet<string>;
  }

  if (action.type === 'UNINSTALL') {
    if (!state.has(action.id)) {
      // 존재하지 않음 — 동일 참조 반환 (re-render 방지)
      return state;
    }
    const next = new Set(state);
    next.delete(action.id);
    return next as ReadonlySet<string>;
  }

  return state;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const InstalledAppsContext = createContext<InstalledAppsContextValue | null>(
  null,
);

// ─── Provider ─────────────────────────────────────────────────────────────────

type InstalledAppsProviderProps = {
  children: React.ReactNode;
};

/**
 * InstalledAppsProvider
 *
 * P2=α: 메모리 React Context + useReducer (POC v1).
 * 작업 3에서 IndexedDB로 reshape — 인터페이스(InstalledAppsContextValue) 무변경.
 *
 * SSR 안전: window/document/localStorage 접근 없음 (메모리 only).
 * StrictMode 안전: useReducer + useCallback + useMemo만 사용 (부작용 없음).
 */
export function InstalledAppsProvider({
  children,
}: InstalledAppsProviderProps): React.JSX.Element {
  const [installedIds, dispatch] = useReducer(
    installedAppsReducer,
    new Set<string>() as ReadonlySet<string>,
  );

  const install = useCallback((id: string): void => {
    dispatch({ type: 'INSTALL', id });
  }, []);

  const uninstall = useCallback((id: string): void => {
    dispatch({ type: 'UNINSTALL', id });
  }, []);

  const isInstalled = useCallback(
    (id: string): boolean => installedIds.has(id),
    [installedIds],
  );

  // useMemo로 stable reference — installedIds 변경 시에만 새 객체 생성
  const value = useMemo<InstalledAppsContextValue>(
    () => ({ installedIds, isInstalled, install, uninstall }),
    [installedIds, isInstalled, install, uninstall],
  );

  return (
    <InstalledAppsContext.Provider value={value}>
      {children}
    </InstalledAppsContext.Provider>
  );
}

// ─── Context accessor ─────────────────────────────────────────────────────────

/**
 * InstalledAppsContext를 반환한다.
 * InstalledAppsProvider 밖에서 호출하면 throw.
 *
 * @internal — useInstalledApps() 훅에서만 사용.
 */
export function useInstalledAppsContext(): InstalledAppsContextValue {
  const ctx = useContext(InstalledAppsContext);
  if (ctx === null) {
    throw new Error(
      'useInstalledAppsContext: InstalledAppsProvider 하위에서 호출해야 합니다.',
    );
  }
  return ctx;
}
