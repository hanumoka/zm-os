'use client';

import React from 'react';
import { Desktop } from '@/components/desktop/Desktop';

/**
 * Home — zm-os 메인 페이지 (/).
 *
 * Provider 제거: InstalledAppsProvider + WindowManagerProvider는 layout.tsx로 이동.
 * (옵션 A — / 와 /store 공유, phase-2-plan §3)
 */
export default function Home(): React.JSX.Element {
  return (
    <div className="w-screen h-screen overflow-hidden">
      <Desktop />
    </div>
  );
}
