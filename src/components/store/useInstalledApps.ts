'use client';

import type { InstalledAppsContextValue } from './InstalledAppsProvider';
import { useInstalledAppsContext } from './InstalledAppsProvider';

/**
 * useInstalledApps()
 *
 * InstalledAppsProvider 하위 트리에서 InstalledAppsContextValue 인터페이스를 반환한다.
 *
 * 의존성 그래프:
 *   useInstalledApps → InstalledAppsProvider (Context accessor)
 *   useInstalledApps ⬅ Desktop (아이콘 필터링)
 *   useInstalledApps ⬅ store/page.tsx (설치 상태 읽기/쓰기)
 *
 * @returns InstalledAppsContextValue (§5 인터페이스 그대로)
 */
export function useInstalledApps(): InstalledAppsContextValue {
  return useInstalledAppsContext();
}
