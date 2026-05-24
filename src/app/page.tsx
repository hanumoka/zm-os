'use client';

import React from 'react';
import { WindowManagerProvider } from '@/components/desktop/WindowManagerProvider';
import { Desktop } from '@/components/desktop/Desktop';

/**
 * Home — zm-os 메인 페이지.
 *
 * P2=α: src/app/page.tsx 직접 교체 (route group 미도입).
 * metadata는 layout.tsx에 유지 — 'use client' page와 충돌 없음.
 *
 * WindowManagerProvider로 전체 Desktop을 감싸 윈도우 상태를 관리.
 */
export default function Home(): React.JSX.Element {
  return (
    <WindowManagerProvider>
      <div className="w-screen h-screen overflow-hidden">
        <Desktop />
      </div>
    </WindowManagerProvider>
  );
}
