// 순수 함수 모듈 (reducer + 헬퍼). 'use client' 불필요 — 환경 의존 없음.
// 서버에서도 import 가능하지만 실제 호출은 Provider(클라이언트) 에서만.

import type { WindowState, WindowOpenInit } from './types';

// ─── 기본값 상수 ──────────────────────────────────────────────────────────────

/** z-index 베이스 (architect §8 가정 A8) */
const Z_BASE = 10;

/** 포커스 시 z-index 증분 */
const Z_STEP = 1;

/** 기본 윈도우 위치 (겹침 방지를 위한 cascade 오프셋 기준) */
const DEFAULT_POSITION = { x: 80, y: 80 };

/** 기본 윈도우 크기 */
const DEFAULT_SIZE = { width: 640, height: 480 };

// ─── Action 타입 ──────────────────────────────────────────────────────────────

export type WindowAction =
  | { type: 'OPEN'; payload: WindowOpenInit }
  | { type: 'CLOSE'; payload: { id: string } }
  | { type: 'MINIMIZE'; payload: { id: string } }
  | { type: 'MAXIMIZE'; payload: { id: string } }
  | { type: 'RESTORE'; payload: { id: string } }
  | { type: 'FOCUS'; payload: { id: string } }
  | { type: 'SET_POSITION'; payload: { id: string; x: number; y: number } }
  | { type: 'SET_SIZE'; payload: { id: string; width: number; height: number } };

// ─── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** 전체 윈도우 중 최대 zIndex를 반환한다. */
function maxZIndex(windows: WindowState[]): number {
  if (windows.length === 0) return Z_BASE;
  return windows.reduce((acc, w) => Math.max(acc, w.zIndex), Z_BASE);
}

/** 새 윈도우의 cascade 위치: 기존 윈도우 수에 따라 오프셋 적용 */
function cascadePosition(
  count: number,
  init?: { x: number; y: number },
): { x: number; y: number } {
  if (init !== undefined) return init;
  const offset = (count % 10) * 24;
  return { x: DEFAULT_POSITION.x + offset, y: DEFAULT_POSITION.y + offset };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function windowReducer(
  state: WindowState[],
  action: WindowAction,
): WindowState[] {
  switch (action.type) {
    case 'OPEN': {
      const { id, title, contentId, initialPosition, initialSize } =
        action.payload;
      // 이미 열린 윈도우는 focus만
      const existing = state.find((w) => w.id === id);
      if (existing !== undefined) {
        return windowReducer(state, { type: 'FOCUS', payload: { id } });
      }
      const newZIndex = maxZIndex(state) + Z_STEP;
      const newWindow: WindowState = {
        id,
        title,
        contentId,
        state: 'open',
        zIndex: newZIndex,
        position: cascadePosition(state.length, initialPosition),
        size: initialSize ?? { ...DEFAULT_SIZE },
      };
      return [...state, newWindow];
    }

    case 'CLOSE':
      return state.filter((w) => w.id !== action.payload.id);

    case 'MINIMIZE':
      return state.map((w) =>
        w.id === action.payload.id ? { ...w, state: 'minimized' as const } : w,
      );

    case 'MAXIMIZE':
      return state.map((w) =>
        w.id === action.payload.id ? { ...w, state: 'maximized' as const } : w,
      );

    case 'RESTORE':
      return state.map((w) =>
        w.id === action.payload.id ? { ...w, state: 'open' as const } : w,
      );

    case 'FOCUS': {
      const newZIndex = maxZIndex(state) + Z_STEP;
      return state.map((w) =>
        w.id === action.payload.id ? { ...w, zIndex: newZIndex } : w,
      );
    }

    case 'SET_POSITION':
      return state.map((w) =>
        w.id === action.payload.id
          ? { ...w, position: { x: action.payload.x, y: action.payload.y } }
          : w,
      );

    case 'SET_SIZE':
      return state.map((w) =>
        w.id === action.payload.id
          ? {
              ...w,
              size: {
                width: action.payload.width,
                height: action.payload.height,
              },
            }
          : w,
      );

    default:
      return state;
  }
}
