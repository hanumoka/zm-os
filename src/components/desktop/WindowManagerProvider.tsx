'use client';

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { WindowManager, WindowState, WindowOpenInit } from './types';
import { windowReducer } from './windowReducer';

// ─── Context ──────────────────────────────────────────────────────────────────

const WindowManagerContext = createContext<WindowManager | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

type WindowManagerProviderProps = {
  children: React.ReactNode;
};

/**
 * WindowManagerProvider
 *
 * P1=A: React Context + useReducer (외부 의존성 0).
 * POC 단계: 다중 윈도우 5-10개 가정 — Provider 재렌더링 비용 허용.
 * v2 reshape: Zustand 전환 시 인터페이스(§3.2) 동일하므로 내부만 교체.
 *
 * ADR-0005 참조.
 */
export function WindowManagerProvider({
  children,
}: WindowManagerProviderProps): React.JSX.Element {
  const [windows, dispatch] = useReducer(
    windowReducer,
    [] as WindowState[],
  );

  const open = useCallback((init: WindowOpenInit): void => {
    dispatch({ type: 'OPEN', payload: init });
  }, []);

  const close = useCallback((id: string): void => {
    dispatch({ type: 'CLOSE', payload: { id } });
  }, []);

  const minimize = useCallback((id: string): void => {
    dispatch({ type: 'MINIMIZE', payload: { id } });
  }, []);

  const maximize = useCallback((id: string): void => {
    dispatch({ type: 'MAXIMIZE', payload: { id } });
  }, []);

  const restore = useCallback((id: string): void => {
    dispatch({ type: 'RESTORE', payload: { id } });
  }, []);

  const focus = useCallback((id: string): void => {
    dispatch({ type: 'FOCUS', payload: { id } });
  }, []);

  const setPosition = useCallback((id: string, x: number, y: number): void => {
    dispatch({ type: 'SET_POSITION', payload: { id, x, y } });
  }, []);

  const setSize = useCallback(
    (id: string, width: number, height: number): void => {
      dispatch({ type: 'SET_SIZE', payload: { id, width, height } });
    },
    [],
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

// ─── Context accessor ─────────────────────────────────────────────────────────

/**
 * WindowManagerContext를 반환한다.
 * WindowManagerProvider 밖에서 호출하면 throw.
 *
 * @internal — useWindowManager() 훅에서만 사용.
 */
export function useWindowManagerContext(): WindowManager {
  const ctx = useContext(WindowManagerContext);
  if (ctx === null) {
    throw new Error(
      'useWindowManagerContext: WindowManagerProvider 하위에서 호출해야 합니다.',
    );
  }
  return ctx;
}
