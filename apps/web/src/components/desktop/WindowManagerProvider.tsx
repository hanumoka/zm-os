'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import type { WindowManager, WindowState, WindowOpenInit } from './types';
import { windowReducer } from './windowReducer';
import type { PersistedWindowLayout, DesktopLayoutRecord } from '@/lib/storage/desktop-layout';
import {
  loadDesktopLayout,
  saveDesktopLayout,
} from '@/lib/storage/desktop-layout';
import { NS_DESKTOP_LAYOUT } from '@zm/core';
import { usePersistence } from '@/lib/storage/use-persistence';

// ─── 상수 ────────────────────────────────────────────────────────────────────

const PERSIST_DEBOUNCE_MS = 500;
const Z_BASE = 10;
const Z_STEP = 1;

// ─── Context ─────────────────────────────────────────────────────────────────

const WindowManagerContext = createContext<WindowManager | null>(null);

// ─── 헬퍼 ────────────────────────────────────────────────────────────────────

function windowsToLayout(windows: WindowState[]): DesktopLayoutRecord {
  const layouts: PersistedWindowLayout[] = windows.map((w) => ({
    contentId: w.contentId,
    position: { ...w.position },
    size: { ...w.size },
    state: w.state,
  }));
  return { savedAt: Date.now(), windows: layouts };
}

function layoutToWindows(layouts: ReadonlyArray<PersistedWindowLayout>): WindowState[] {
  return layouts.map((l, i) => ({
    id: l.contentId,
    title: '',
    contentId: l.contentId,
    state: l.state,
    zIndex: Z_BASE + (i + 1) * Z_STEP,
    position: { ...l.position },
    size: { ...l.size },
  }));
}

// ─── 구조 변경 감지 ──────────────────────────────────────────────────────────

type StructuralAction = 'OPEN' | 'CLOSE' | 'MINIMIZE' | 'MAXIMIZE' | 'RESTORE';

const STRUCTURAL_ACTIONS = new Set<string>([
  'OPEN',
  'CLOSE',
  'MINIMIZE',
  'MAXIMIZE',
  'RESTORE',
]);

function isStructuralAction(type: string): type is StructuralAction {
  return STRUCTURAL_ACTIONS.has(type);
}

// ─── Provider ────────────────────────────────────────────────────────────────

type WindowManagerProviderProps = {
  children: React.ReactNode;
};

export function WindowManagerProvider({
  children,
}: WindowManagerProviderProps): React.JSX.Element {
  const [windows, dispatch] = useReducer(windowReducer, [] as WindowState[]);
  const windowsRef = useRef(windows);
  windowsRef.current = windows;

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { writable, persistAsync } = usePersistence<DesktopLayoutRecord | undefined>({
    namespace: NS_DESKTOP_LAYOUT,
    loadFn: loadDesktopLayout,
    onHydrate: (record) => {
      if (record === undefined || record.windows.length === 0) return;
      dispatch({
        type: 'RESTORE_LAYOUT',
        payload: { windows: layoutToWindows(record.windows) },
      });
    },
  });

  // 저장해도 안전한 시점인가 (hydrated && !hydrationFailed) — usePersistence가 판정한다.
  const writableRef = useRef(writable);
  writableRef.current = writable;

  // ─── Persist 헬퍼 ──────────────────────────────────────────────────────────

  const persistNow = useCallback((): void => {
    // hydration 전이거나 실패했으면 메모리 상태가 빈 배열이다.
    // 이를 저장하면 읽지 못했을 뿐 멀쩡한 사용자 레이아웃을 지운다.
    if (!writableRef.current) return;
    // 빈 배열도 저장한다. 마지막 윈도우를 닫은 사실이 기록되지 않으면
    // 새로고침 때 닫은 윈도우가 되살아난다.
    persistAsync('persist', () =>
      saveDesktopLayout(windowsToLayout(windowsRef.current)),
    );
  }, [persistAsync]);

  const persistDebounced = useCallback((): void => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      persistNow();
    }, PERSIST_DEBOUNCE_MS);
  }, [persistNow]);

  const persistImmediate = useCallback((): void => {
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    persistNow();
  }, [persistNow]);

  // ─── visibilitychange flush ────────────────────────────────────────────────

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') {
        persistImmediate();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [persistImmediate]);

  // ─── 액션 래퍼 (persist 트리거 통합) ──────────────────────────────────────

  // dispatch는 비동기다 — 호출 직후에는 windowsRef가 아직 이전 상태를 가리킨다.
  // 따라서 저장을 여기서 실행하지 않고 "예약"만 하고, windows가 실제로 커밋된 뒤
  // 아래 effect에서 실행한다. 이렇게 하지 않으면 OPEN 직후 저장이 이전 상태를
  // (첫 윈도우라면 빈 배열을) 기록해 열린 창이 영속화되지 않는다.
  // 예약에는 '어느 상태에서 예약했는지'를 함께 담는다.
  //
  // 자식 컴포넌트의 effect에서 디스패치하면(예: Desktop의 APP-04 자동 닫기)
  // passive effect가 자식→부모 순으로 flush되므로, 예약 직후 같은 커밋에서
  // 부모의 이 effect가 돌아 버린다. 그때 windowsRef는 아직 디스패치 이전 상태라
  // 예전 내용을 저장하고, 예약은 소비돼 실제 변경분은 영영 저장되지 않는다.
  // 예약 당시 상태와 현재 상태가 같으면 아직 반영 전이므로 넘긴다.
  const pendingPersistRef = useRef<
    { mode: 'immediate' | 'debounced'; from: WindowState[] } | null
  >(null);

  const dispatchWithPersist = useCallback(
    (action: Parameters<typeof dispatch>[0]): void => {
      dispatch(action);
      pendingPersistRef.current = {
        mode: isStructuralAction(action.type) ? 'immediate' : 'debounced',
        from: windowsRef.current,
      };
    },
    [],
  );

  useEffect(() => {
    const pending = pendingPersistRef.current;
    if (pending === null) return;
    // 아직 디스패치 결과가 커밋되지 않았다 — 다음 커밋에서 처리한다.
    if (pending.from === windows) return;
    pendingPersistRef.current = null;
    if (pending.mode === 'immediate') {
      persistImmediate();
    } else {
      persistDebounced();
    }
  }, [windows, persistImmediate, persistDebounced]);

  const open = useCallback(
    (init: WindowOpenInit): void => {
      dispatchWithPersist({ type: 'OPEN', payload: init });
    },
    [dispatchWithPersist],
  );

  const close = useCallback(
    (id: string): void => {
      dispatchWithPersist({ type: 'CLOSE', payload: { id } });
    },
    [dispatchWithPersist],
  );

  const minimize = useCallback(
    (id: string): void => {
      dispatchWithPersist({ type: 'MINIMIZE', payload: { id } });
    },
    [dispatchWithPersist],
  );

  const maximize = useCallback(
    (id: string): void => {
      dispatchWithPersist({ type: 'MAXIMIZE', payload: { id } });
    },
    [dispatchWithPersist],
  );

  const restore = useCallback(
    (id: string): void => {
      dispatchWithPersist({ type: 'RESTORE', payload: { id } });
    },
    [dispatchWithPersist],
  );

  const focus = useCallback(
    (id: string): void => {
      dispatchWithPersist({ type: 'FOCUS', payload: { id } });
    },
    [dispatchWithPersist],
  );

  const setPosition = useCallback(
    (id: string, x: number, y: number): void => {
      dispatchWithPersist({ type: 'SET_POSITION', payload: { id, x, y } });
    },
    [dispatchWithPersist],
  );

  const setSize = useCallback(
    (id: string, width: number, height: number): void => {
      dispatchWithPersist({ type: 'SET_SIZE', payload: { id, width, height } });
    },
    [dispatchWithPersist],
  );

  const manager = useMemo<WindowManager>(
    () => ({ windows, open, close, minimize, maximize, restore, focus, setPosition, setSize }),
    [windows, open, close, minimize, maximize, restore, focus, setPosition, setSize],
  );

  return (
    <WindowManagerContext.Provider value={manager}>
      {children}
    </WindowManagerContext.Provider>
  );
}

// ─── Context accessor ────────────────────────────────────────────────────────

export function useWindowManagerContext(): WindowManager {
  const ctx = useContext(WindowManagerContext);
  if (ctx === null) {
    throw new Error(
      'useWindowManagerContext: WindowManagerProvider 하위에서 호출해야 합니다.',
    );
  }
  return ctx;
}
