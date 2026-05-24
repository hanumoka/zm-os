// 순수 데이터/타입 모듈 — 'use client' 불필요 (런타임 React 코드 없음).
// P1=A: 하드코딩 desktopApps (POC v1, ADR-0006).
// ADR-0006: v2 단계에서 API 기반 앱 레지스트리로 교체 예정.

import type { SandboxIpcOptions } from '@/lib/apps/sandbox';

// ─── AppIcon ──────────────────────────────────────────────────────────────────

export type AppIcon =
  | { kind: 'emoji'; char: string }
  | { kind: 'url'; src: string; alt: string };

// ─── DesktopAppEntry ──────────────────────────────────────────────────────────

/**
 * 데스크탑에 표시되는 앱 항목 정의.
 * ADR-0006: POC v1 — 하드코딩 배열. v2에서 API 기반으로 교체.
 */
export type DesktopAppEntry = {
  /** 앱 고유 ID (WindowState.contentId로 사용됨) */
  id: string;
  /** 사람이 읽을 수 있는 앱 이름 */
  name: string;
  /** 데스크탑 아이콘 표현 */
  icon: AppIcon;
  /** AppManifest 호환 raw 객체 (parseManifest에 전달됨) */
  manifest: unknown;
  /** iframe에 로드할 정적 파일 URL (/public 기준) */
  contentUrl: string;
  /** IPC 설정 (선택적 — IPC 앱만) */
  ipc?: SandboxIpcOptions;
  /** 데스크탑 아이콘 좌상단 절대 위치 (px) */
  iconPosition?: { x: number; y: number };
  /** 윈도우 초기 위치/크기 기본값 */
  windowDefaults?: {
    position?: { x: number; y: number };
    size?: { width: number; height: number };
  };
};

// ─── DESKTOP_APPS ────────────────────────────────────────────────────────────

/**
 * POC v1 하드코딩 앱 목록.
 * ReadonlyArray — 런타임 변경 불가.
 */
export const DESKTOP_APPS: ReadonlyArray<DesktopAppEntry> = [
  // ── Bouncing Ball ──────────────────────────────────────────────────────────
  {
    id: 'bouncing-ball',
    name: 'Bouncing Ball',
    icon: { kind: 'emoji', char: '🟢' },
    contentUrl: '/sample-game/index.html',
    iconPosition: { x: 30, y: 30 },
    windowDefaults: {
      position: { x: 80, y: 60 },
      size: { width: 520, height: 380 },
    },
    manifest: {
      schemaVersion: 1,
      id: 'com.zmos.sample.bouncing-ball',
      name: 'Bouncing Ball',
      version: '1.0.0',
      author: 'zm-os team',
      description: 'POC 샌드박스 격리 검증용 미니 게임',
      entryPoint: 'index.html',
      size: { defaultWidth: 480, defaultHeight: 320 },
    },
  },

  // ── IPC Demo ───────────────────────────────────────────────────────────────
  {
    id: 'ipc-demo',
    name: 'IPC Demo',
    icon: { kind: 'emoji', char: '📡' },
    contentUrl: '/sample-game-ipc/index.html',
    iconPosition: { x: 30, y: 130 },
    windowDefaults: {
      position: { x: 640, y: 60 },
      size: { width: 520, height: 380 },
    },
    manifest: {
      schemaVersion: 1,
      id: 'com.zmos.sample.ipc-demo',
      name: 'IPC Demo',
      version: '1.0.0',
      author: 'zm-os team',
      description: 'Comlink IPC 양방향 RPC 데모',
      entryPoint: 'index.html',
      size: { defaultWidth: 480, defaultHeight: 320 },
    },
    ipc: {
      allowedMethods: ['ping', 'getTime', 'echo'],
      defaultTimeoutMs: 5000,
      expose: {
        ping: (): Promise<'pong'> => {
          return Promise.resolve('pong');
        },
        getTime: (): Promise<string> => {
          return Promise.resolve(new Date().toISOString());
        },
        echo: (...args: unknown[]): Promise<string> => {
          const msg =
            typeof args[0] === 'string' ? args[0] : String(args[0] ?? '');
          return Promise.resolve('host echoed: ' + msg);
        },
      },
    },
  },
] as const;

// ─── findDesktopApp ───────────────────────────────────────────────────────────

/**
 * id로 DesktopAppEntry를 검색한다.
 * @returns DesktopAppEntry | undefined
 */
export function findDesktopApp(id: string): DesktopAppEntry | undefined {
  return DESKTOP_APPS.find((app) => app.id === id);
}
