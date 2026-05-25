'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useCallback,
  useMemo,
} from 'react';
import {
  listInstalledAppIds,
  persistInstalledApp,
  removeInstalledApp,
} from '@/lib/storage/installed-apps';
import { usePersistenceError } from '@/lib/errors/PersistenceErrorContext';
import { createPersistenceError } from '@/lib/errors/persistence-error';

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
  | { type: 'UNINSTALL'; id: string }
  | { type: 'HYDRATE'; ids: ReadonlyArray<string> }; // IDB hydration (P8: race-safe union)

/**
 * immutable Set reducer.
 * 이미 존재하는 id install → 동일 참조 반환 (re-render 방지).
 * 존재하지 않는 id uninstall → 동일 참조 반환.
 * HYDRATE: hydration 도착 전 사용자 액션 보존 — IDB ids ∪ state (union, P8).
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

  if (action.type === 'HYDRATE') {
    // hydration 도착 전 사용자 액션 보존 — IDB ids + 현재 state union (race-safe, P8)
    if (action.ids.length === 0 && state.size === 0) {
      // 둘 다 비어 있음 — 동일 참조 반환 (re-render 방지)
      return state;
    }
    const next = new Set(state); // 기존 state 보존 (hydration 전 사용자 액션 유지)
    let changed = false;
    for (const id of action.ids) {
      if (!next.has(id)) {
        next.add(id);
        changed = true;
      }
    }
    return changed ? (next as ReadonlySet<string>) : state;
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
 * P1=A: useEffect 1회 hydration (IDB → HYDRATE dispatch).
 * P2=α: fire-and-forget IDB persist (install/uninstall 동기 dispatch + 비동기 IDB 저장).
 * P4=ㄱ: 에러는 console.error만 (silent).
 * P7=A: InstalledAppsContextValue 무변경.
 *
 * SSR 안전: IDB 접근은 useEffect 내부에서만 — listInstalledAppIds/persistInstalledApp/removeInstalledApp
 *           내부에서 isIDBAvailable() 가드 자동 처리 (STG-01 lib).
 * StrictMode 안전: useEffect cancelled flag로 비동기 race 방지 (frontend.md 비동기 패턴 b).
 */
export function InstalledAppsProvider({
  children,
}: InstalledAppsProviderProps): React.JSX.Element {
  const [installedIds, dispatch] = useReducer(
    installedAppsReducer,
    new Set<string>() as ReadonlySet<string>,
  );
  const { onPersistenceError } = usePersistenceError();

  // ── IDB hydration (P1=A, frontend.md 비동기 패턴 b — cancelled flag) ──────
  useEffect(() => {
    let cancelled = false;
    listInstalledAppIds()
      .then((ids) => {
        if (cancelled) return;
        dispatch({ type: 'HYDRATE', ids });
      })
      .catch((err: unknown) => {
        onPersistenceError(createPersistenceError('installed-apps', 'hydrate', err));
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // ── install: 동기 dispatch + fire-and-forget IDB persist (P3=α, P4=ㄱ) ────
  const install = useCallback((id: string): void => {
    dispatch({ type: 'INSTALL', id });
    void persistInstalledApp(id).catch((err: unknown) => {
      onPersistenceError(createPersistenceError('installed-apps', 'persist', err));
    });
  }, [onPersistenceError]);

  // ── uninstall: 동기 dispatch + fire-and-forget IDB 삭제 (P3=α, P4=ㄱ) ────
  const uninstall = useCallback((id: string): void => {
    dispatch({ type: 'UNINSTALL', id });
    void removeInstalledApp(id).catch((err: unknown) => {
      onPersistenceError(createPersistenceError('installed-apps', 'delete', err));
    });
  }, [onPersistenceError]);

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
