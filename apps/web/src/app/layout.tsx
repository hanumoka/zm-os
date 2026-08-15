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
 * 동적 렌더링 강제 — **지우면 프로덕션 셸이 조용히 죽는다.**
 *
 * Next.js는 요청에 실린 CSP 헤더를 근거로 SSR 중에 nonce를 주입한다. 정적 페이지는
 * 빌드 타임에 생성되어 요청 헤더가 없으므로 nonce가 주입되지 않고, 그러면 prerender된
 * inline script 6개가 `script-src`에 차단되어 hydration이 실패한다.
 *
 * 화면에는 SSR 마크업이 그대로 보이기 때문에 증상이 눈에 잘 띄지 않는다.
 * 검증: `next build` 출력에서 라우트가 `○ (Static)`이 아니라 `ƒ (Dynamic)`이어야 한다.
 *
 * 배경: `src/proxy.ts`와 `zm-docs`의 2026-08-15 프로덕션 빌드 실측.
 */
export const dynamic = 'force-dynamic';

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
