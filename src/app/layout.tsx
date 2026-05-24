import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { UserAppsProvider } from '@/components/store/UserAppsProvider';
import { InstalledAppsProvider } from '@/components/store/InstalledAppsProvider';
import { WindowManagerProvider } from '@/components/desktop/WindowManagerProvider';

export const metadata: Metadata = {
  title: 'zm-os',
  description: 'Browser-based virtual desktop POC',
};

/**
 * RootLayout — 모든 라우트 공유 레이아웃.
 *
 * Provider 순서 (옵션 A — phase-2-plan §3):
 *   InstalledAppsProvider (외) > WindowManagerProvider (내) > {children}
 *   → / 와 /store가 동일 설치 상태 Context 공유.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="ko">
      <body>
        <UserAppsProvider>
          <InstalledAppsProvider>
            <WindowManagerProvider>{children}</WindowManagerProvider>
          </InstalledAppsProvider>
        </UserAppsProvider>
      </body>
    </html>
  );
}
