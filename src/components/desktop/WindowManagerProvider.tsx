'use client';

import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { WindowManager, WindowState, WindowOpenInit } from './types';
import { windowReducer } from './windowReducer';
import type { PersistedWindowLayout, DesktopLayoutRecord } from '@/lib/storage/desktop-layout';
import {
  loadDesktopLayout,
  saveDesktopLayout,
} from '@/lib/storage/desktop-layout';

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
  const hydratedRef = useRef(false);

  // ─── Persist 헬퍼 ──────────────────────────────────────────────────────────

  const persistNow = useCallback((): void => {
    if (!hydratedRef.current) return;
    const current = windowsRef.current;
    if (current.length === 0) return;
    void saveDesktopLayout(windowsToLayout(current)).catch(console.error);
  }, []);

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

  // ─── Hydration (mount 시 1회) ──────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    void loadDesktopLayout()
      .then((record) => {
        if (cancelled) return;
        hydratedRef.current = true;
        if (record === undefined || record.windows.length === 0) return;
        dispatch({
          type: 'RESTORE_LAYOUT',
          payload: { windows: layoutToWindows(record.windows) },
        });
      })
      .catch((e) => {
        if (cancelled) return;
        hydratedRef.current = true;
        console.error('[WindowManager] layout hydration failed:', e);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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

  const dispatchWithPersist = useCallback(
    (action: Parameters<typeof dispatch>[0]): void => {
      dispatch(action);
      if (isStructuralAction(action.type)) {
        persistImmediate();
      } else {
        persistDebounced();
      }
    },
    [persistImmediate, persistDebounced],
  );

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

  const manager: WindowManager = {
    windows,
    open,
    close,
    minimize,
    maximize,
    restore,
    focus,
    setPosition,
    setSize,
  };

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
