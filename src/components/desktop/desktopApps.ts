// 순수 데이터/타입 모듈 — 'use client' 불필요 (런타임 React 코드 없음).
// P1=A: 하드코딩 desktopApps (POC v1, ADR-0006).
// ADR-0006: v2 단계에서 API 기반 앱 레지스트리로 교체 예정.

import type { SandboxIpcOptions } from '@/lib/apps/sandbox';

// ─── AppIcon ──────────────────────────────────────────────────────────────────

export type AppIcon =
  | { kind: 'emoji'; char: string }
  | { kind: 'url'; src: string; alt: string };

// ─── DesktopAppCategory ───────────────────────────────────────────────────────

/** STR-01: 앱 스토어 카테고리 (P1=A, phase-2-plan §5) */
export type DesktopAppCategory = 'game' | 'utility' | 'demo';

// ─── DesktopAppEntry ──────────────────────────────────────────────────────────

/**
 * 데스크탑에 표시되는 앱 항목 정의.
 * ADR-0006: POC v1 — 하드코딩 배열. v2에서 API 기반으로 교체.
 * STR-01: optional 스토어 메타데이터 필드 추가 (phase-2-plan §5).
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
  // ── STR-01 스토어 메타데이터 (optional) ──────────────────────────────────
  /** 한 줄 설명 (스토어 카드 표시) */
  description?: string;
  /** 긴 설명 (스토어 상세 패널 표시) */
  longDescription?: string;
  /** 앱 카테고리 */
  category?: DesktopAppCategory;
  /** 스크린샷 URL 목록 (/public 기준) */
  screenshots?: ReadonlyArray<string>;
  /** 앱 제작자 */
  author?: string;
  /** 앱 버전 문자열 */
  version?: string;
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
    // STR-01 메타데이터
    description: 'sandbox iframe 안에서 동작하는 공 튀기기 미니 게임',
    longDescription:
      'zm-os 샌드박스 격리 정책을 검증하기 위해 제작된 POC 데모 게임입니다. ' +
      'blob: URL + allow-scripts sandbox 환경에서 순수 JavaScript로 동작하며, ' +
      '호스트 origin 스토리지 및 DOM에 일절 접근할 수 없습니다. ' +
      '공이 벽에 부딪혀 튕기는 물리 시뮬레이션을 구현합니다.',
    category: 'demo',
    author: 'zm-os team',
    version: '1.0.0',
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
    // STR-01 메타데이터
    description: 'Comlink 기반 host-app 양방향 RPC 통신 데모',
    longDescription:
      'sandbox iframe과 호스트 페이지 사이의 안전한 IPC(Inter-Process Communication) 데모입니다. ' +
      'Comlink 어댑터를 사용하여 ping, getTime, echo 세 가지 RPC 메서드를 노출하며, ' +
      'raw postMessage 직접 호출 없이 타입 안전한 RPC 통신을 구현합니다. ' +
      '샌드박스 앱이 호스트 기능을 안전하게 호출하는 패턴을 검증합니다.',
    category: 'demo',
    author: 'zm-os team',
    version: '1.0.0',
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
