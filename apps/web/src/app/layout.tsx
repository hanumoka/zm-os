import React from 'react';
import type { Metadata } from 'next';
import './globals.css';
import { UserAppsProvider } from '@/components/store/UserAppsProvider';
import { InstalledAppsProvider } from '@/components/store/InstalledAppsProvider';
import { WindowManagerProvider } from '@/components/desktop/WindowManagerProvider';
import { DesktopSettingsProvider } from '@/components/desktop/DesktopSettingsProvider';
import { PersistenceErrorProvider } from '@/lib/errors/PersistenceErrorContext';

export const metadata: Metadata = {
  title: 'zm-os',
  description: 'Browser-based virtual desktop POC',
};

/**
 * RootLayout — 모든 라우트 공유 레이아웃.
 *
 * Provider 순서 (DSK-05 + 옵션 A — phase-2-plan §3):
 *   DesktopSettingsProvider (최외) > InstalledAppsProvider (외) > WindowManagerProvider (내) > {children}
 *   → 모든 라우트가 동일한 데스크탑 설정(테마/배경) Context 공유.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="ko">
      <body>
        <PersistenceErrorProvider>
          <DesktopSettingsProvider>
            <UserAppsProvider>
              <InstalledAppsProvider>
                <WindowManagerProvider>{children}</WindowManagerProvider>
              </InstalledAppsProvider>
            </UserAppsProvider>
          </DesktopSettingsProvider>
        </PersistenceErrorProvider>
      </body>
    </html>
  );
}
