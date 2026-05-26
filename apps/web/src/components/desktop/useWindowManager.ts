'use client';

import type { WindowManager } from './types';
import { useWindowManagerContext } from './WindowManagerProvider';

/**
 * useWindowManager()
 *
 * WindowManagerProvider 하위 트리에서 WindowManager 인터페이스를 반환한다.
 *
 * 의존성 그래프:
 *   useWindowManager → WindowManagerProvider (Context accessor)
 *   useWindowManager ⬅ Window (import 없음 — controlled 패턴, architect §4)
 *
 * @returns WindowManager (§3.2 인터페이스 그대로)
 */
export function useWindowManager(): WindowManager {
  return useWindowManagerContext();
}
