'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { listUserApps, saveUserApp, deleteUserApp } from '@/lib/storage/user-apps';
import type { UserAppRecord } from '@/lib/storage/user-apps';
import type { ParsedUserApp } from '@/lib/apps/zip-loader';

// ─── Context Value 타입 ────────────────────────────────────────────────────────

export type UserAppsContextValue = {
  /** IDB에서 hydrate된 사용자 업로드 앱 목록 */
  userApps: ReadonlyArray<UserAppRecord>;
  /** id가 사용자 업로드 앱인지 확인 */
  hasUserApp: (id: string) => boolean;
  /** ZIP 파싱 완료된 앱을 추가하고 IDB에 영속화 */
  addUserApp: (parsed: ParsedUserApp) => Promise<void>;
  /** 사용자 앱을 제거하고 IDB에서 삭제 */
  removeUserApp: (id: string) => Promise<void>;
  /** 기존 앱을 새 버전으로 교체하고 IDB에 영속화 */
  updateUserApp: (parsed: ParsedUserApp) => Promise<void>;
  /** manifest.id → manifest.version 맵 (loadUserAppFromZip existingUserApps 인자용) */
  userAppVersions: ReadonlyMap<string, string>;
};

// ─── Reducer ──────────────────────────────────────────────────────────────────

type State = ReadonlyArray<UserAppRecord>;

type Action =
  | { type: 'HYDRATE'; apps: ReadonlyArray<UserAppRecord> }
  | { type: 'ADD'; app: UserAppRecord }
  | { type: 'REMOVE'; id: string };

/**
 * immutable array reducer.
 * HYDRATE: hydration 도착 전 사용자 액션 보존 — id 기준 union (InstalledAppsProvider 패턴 복제).
 * ADD: 동일 id 있으면 교체, 없으면 추가 (upsert).
 * REMOVE: id 기준 필터.
 */
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'HYDRATE': {
      // hydration 도착 전 사용자 액션 보존 — id 기준 union
      const existingIds = new Set(state.map((a) => a.manifest.id));
      const merged = [...state];
      let changed = false;
      for (const a of action.apps) {
        if (!existingIds.has(a.manifest.id)) {
          merged.push(a);
          changed = true;
        }
      }
      return changed ? merged : state;
    }
    case 'ADD': {
      // 동일 id 있으면 교체(upsert), 없으면 추가
      const next = state.filter((a) => a.manifest.id !== action.app.manifest.id);
      next.push(action.app);
      return next;
    }
    case 'REMOVE':
      return state.filter((a) => a.manifest.id !== action.id);
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

const UserAppsContext = createContext<UserAppsContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * UserAppsProvider
 *
 * APP-02: 사용자 업로드 앱 목록 상태 + IDB 영속화.
 * InstalledAppsProvider 패턴을 복제.
 *
 * P10=A: 단순 상태 (idle/parsing/validating/saving/done/error) — AppUploadButton이 관리.
 *
 * SSR 안전: IDB 접근은 useEffect 내부에서만.
 * StrictMode 안전: useEffect cancelled flag로 비동기 race 방지 (frontend.md 비동기 패턴 b).
 */
export function UserAppsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [userApps, dispatch] = useReducer(reducer, [] as ReadonlyArray<UserAppRecord>);

  // ── IDB hydration (cancelled flag — frontend.md 비동기 패턴 b) ───────────
  useEffect(() => {
    let cancelled = false;
    listUserApps()
      .then((apps) => {
        if (cancelled) return;
        dispatch({ type: 'HYDRATE', apps });
      })
      .catch((err: unknown) => {
        console.error('[UserAppsProvider] hydration 실패', err);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // ── addUserApp: 동기 dispatch + fire-and-forget IDB persist ──────────────
  const addUserApp = useCallback(async (parsed: ParsedUserApp): Promise<void> => {
    const record: UserAppRecord = { ...parsed, installedAt: Date.now() };
    dispatch({ type: 'ADD', app: record });
    try {
      await saveUserApp(record);
    } catch (err) {
      // POC v1 silent fallback — 메모리 상태는 유지됨
      console.error('[UserAppsProvider] IDB persist 실패', { id: record.manifest.id, err });
    }
  }, []);

  // ── removeUserApp: 동기 dispatch + fire-and-forget IDB delete ────────────
  const removeUserApp = useCallback(async (id: string): Promise<void> => {
    dispatch({ type: 'REMOVE', id });
    try {
      await deleteUserApp(id);
    } catch (err) {
      console.error('[UserAppsProvider] IDB delete 실패', { id, err });
    }
  }, []);

  // ── updateUserApp: addUserApp과 동일한 upsert이지만 의미 분리 ─────────────
  const updateUserApp = useCallback(async (parsed: ParsedUserApp): Promise<void> => {
    const record: UserAppRecord = { ...parsed, installedAt: Date.now() };
    dispatch({ type: 'ADD', app: record });
    try {
      await saveUserApp(record);
    } catch (err) {
      console.error('[UserAppsProvider] IDB update 실패', { id: record.manifest.id, err });
    }
  }, []);

  const hasUserApp = useCallback(
    (id: string): boolean => userApps.some((a) => a.manifest.id === id),
    [userApps],
  );

  // ── userAppVersions: id → version 맵 (zip-loader existingUserApps 인자용) ─
  const userAppVersions = useMemo<ReadonlyMap<string, string>>(
    () => new Map(userApps.map((a) => [a.manifest.id, a.manifest.version])),
    [userApps],
  );

  // useMemo로 stable reference — userApps 변경 시에만 새 객체 생성
  const value = useMemo<UserAppsContextValue>(
    () => ({ userApps, hasUserApp, addUserApp, removeUserApp, updateUserApp, userAppVersions }),
    [userApps, hasUserApp, addUserApp, removeUserApp, updateUserApp, userAppVersions],
  );

  return <UserAppsContext.Provider value={value}>{children}</UserAppsContext.Provider>;
}

// ─── Context accessor ─────────────────────────────────────────────────────────

/**
 * useUserApps()
 *
 * UserAppsProvider 하위 트리에서 UserAppsContextValue를 반환한다.
 * Provider 밖에서 호출하면 throw.
 */
export function useUserApps(): UserAppsContextValue {
  const ctx = useContext(UserAppsContext);
  if (ctx === null) {
    throw new Error('useUserApps: UserAppsProvider 하위에서 호출해야 합니다.');
  }
  return ctx;
}
