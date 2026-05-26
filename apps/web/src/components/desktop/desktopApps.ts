// 순수 데이터/타입 모듈 — 'use client' 불필요 (런타임 React 코드 없음).
// P1=A: 하드코딩 desktopApps (POC v1, ADR-0006).
// ADR-0006: v2 단계에서 API 기반 앱 레지스트리로 교체 예정.

import type { SandboxIpcOptions } from '@/lib/apps/sandbox';
import type { UserAppRecord } from '@/lib/storage/user-apps';

// ─── AppIcon ──────────────────────────────────────────────────────────────────

export type AppIcon =
  | { kind: 'emoji'; char: string }
  | { kind: 'url'; src: string; alt: string };

// ─── AppSource ────────────────────────────────────────────────────────────────

/**
 * 앱 출처 구분.
 * - 'built-in': 코드에 하드코딩된 시스템/데모 앱 (DESKTOP_APPS)
 * - 'user': 사용자가 ZIP으로 업로드한 앱 (STORE_USER_APPS)
 */
export type AppSource = 'built-in' | 'user';

// ─── DesktopAppCategory ───────────────────────────────────────────────────────

/** STR-01: 앱 스토어 카테고리 (P1=A, phase-2-plan §5) */
export type DesktopAppCategory = 'game' | 'utility' | 'demo';

// ─── DesktopAppEntry ──────────────────────────────────────────────────────────

/**
 * 데스크탑에 표시되는 앱 항목 정의.
 * ADR-0006: POC v1 — 하드코딩 배열. v2에서 API 기반으로 교체.
 * STR-01: optional 스토어 메타데이터 필드 추가 (phase-2-plan §5).
 * APP-02: source / htmlContent 필드 추가 (사용자 업로드 앱 지원).
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
  /**
   * iframe에 로드할 정적 파일 URL (/public 기준).
   * source === 'user' 앱은 htmlContent를 srcdoc으로 사용하며 contentUrl은 사용 안 됨.
   * built-in 앱만 contentUrl을 사용한다.
   */
  contentUrl?: string;
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
  // ── APP-02 사용자 업로드 앱 추가 필드 ──────────────────────────────────
  /**
   * 앱 출처.
   * 'built-in': 하드코딩 시스템/데모 앱 | 'user': ZIP 업로드 사용자 앱
   */
  source: AppSource;
  /**
   * 사용자 업로드 앱의 HTML 콘텐츠 (srcdoc으로 전달).
   * source === 'user'인 경우에만 존재. built-in 앱은 undefined.
   */
  htmlContent?: string;
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
    source: 'built-in' as const,
    contentUrl: '/sample-game/index.html',
    iconPosition: { x: 30, y: 30 },
    windowDefaults: {
      position: { x: 80, y: 60 },
      size: { width: 520, height: 380 },
    },
    manifest: {
      schemaVersion: 2,
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
    source: 'built-in' as const,
    contentUrl: '/sample-game-ipc/index.html',
    iconPosition: { x: 30, y: 130 },
    windowDefaults: {
      position: { x: 640, y: 60 },
      size: { width: 520, height: 380 },
    },
    manifest: {
      schemaVersion: 2,
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

  // ── Snake Game (Phaser 3) ──────────────────────────────────────────────────
  {
    id: 'snake-game',
    name: 'Snake',
    icon: { kind: 'emoji', char: '🐍' },
    source: 'built-in' as const,
    contentUrl: '/sample-game-phaser/index.html',
    iconPosition: { x: 30, y: 230 },
    windowDefaults: {
      position: { x: 320, y: 80 },
      size: { width: 660, height: 520 },
    },
    manifest: {
      schemaVersion: 2,
      id: 'com.zmos.sample.snake-game',
      name: 'Snake',
      version: '1.0.0',
      author: 'zm-os team',
      description: 'Phaser 3 기반 클래식 스네이크 게임',
      entryPoint: 'index.html',
      size: { defaultWidth: 600, defaultHeight: 440 },
    },
    description: 'Phaser 3 게임 엔진으로 만든 클래식 스네이크',
    longDescription:
      '화살표 키로 뱀을 조종해 음식을 먹고 길이를 늘리세요. ' +
      '벽이나 자기 몸에 부딪히면 게임 오버. Space 키로 재시작합니다. ' +
      'Phaser 3 게임 엔진이 sandbox iframe(null origin) 안에서 동작하며, ' +
      '호스트 origin 스토리지/DOM에 일절 접근할 수 없습니다.',
    category: 'game',
    author: 'zm-os team',
    version: '1.0.0',
  },
  // ── Particle Rain (Pixi.js) ───────────────────────────────────────────────
  {
    id: 'particle-rain',
    name: 'Particle Rain',
    icon: { kind: 'emoji', char: '🌧️' },
    source: 'built-in' as const,
    contentUrl: '/sample-game-pixi/index.html',
    iconPosition: { x: 30, y: 330 },
    windowDefaults: {
      position: { x: 200, y: 60 },
      size: { width: 640, height: 480 },
    },
    manifest: {
      schemaVersion: 2,
      id: 'com.zmos.sample.particle-rain',
      name: 'Particle Rain',
      version: '1.0.0',
      author: 'zm-os team',
      description: 'Pixi.js 기반 파티클 비 데모',
      entryPoint: 'index.html',
      size: { defaultWidth: 600, defaultHeight: 440 },
    },
    description: 'Pixi.js 2D 엔진으로 만든 파티클 비 인터랙션',
    longDescription:
      'Pixi.js 8 WebGL 렌더러가 sandbox iframe(null origin) 안에서 동작하는 데모입니다. ' +
      '200개 파티클이 화면에서 떨어지며, 클릭하면 해당 위치에서 파티클이 폭발합니다. ' +
      '게임 엔진 호환성 매트릭스 Phase 3-B 검증용.',
    category: 'demo',
    author: 'zm-os team',
    version: '1.0.0',
  },

  // ── Spinning Cubes (Three.js) ────────────────────────────────────────────
  {
    id: 'spinning-cubes',
    name: 'Spinning Cubes',
    icon: { kind: 'emoji', char: '🧊' },
    source: 'built-in' as const,
    contentUrl: '/sample-game-three/index.html',
    iconPosition: { x: 30, y: 430 },
    windowDefaults: {
      position: { x: 350, y: 100 },
      size: { width: 640, height: 480 },
    },
    manifest: {
      schemaVersion: 2,
      id: 'com.zmos.sample.spinning-cubes',
      name: 'Spinning Cubes',
      version: '1.0.0',
      author: 'zm-os team',
      description: 'Three.js 기반 3D 회전 큐브 데모',
      entryPoint: 'index.html',
      size: { defaultWidth: 600, defaultHeight: 440 },
    },
    description: 'Three.js 3D 엔진으로 만든 회전 큐브 씬',
    longDescription:
      'Three.js r184 WebGL 렌더러가 sandbox iframe(null origin) 안에서 동작하는 데모입니다. ' +
      '12개 큐브가 와이어프레임 구를 중심으로 공전하며, 마우스를 움직이면 카메라가 추종합니다. ' +
      '게임 엔진 호환성 매트릭스 Phase 3-B 검증용.',
    category: 'demo',
    author: 'zm-os team',
    version: '1.0.0',
  },
] as const;

// ─── findDesktopApp ───────────────────────────────────────────────────────────

/**
 * id로 DesktopAppEntry를 검색한다 (built-in 앱만).
 * 사용자 앱 포함 검색은 buildCatalog() 결과에서 Array.find를 사용하세요.
 * @returns DesktopAppEntry | undefined
 */
export function findDesktopApp(id: string): DesktopAppEntry | undefined {
  return DESKTOP_APPS.find((app) => app.id === id);
}

// ─── buildCatalog ─────────────────────────────────────────────────────────────

/**
 * built-in 앱 + 사용자 업로드 앱을 합쳐 전체 데스크탑 카탈로그를 생성한다.
 *
 * @param userApps  IDB에서 로드한 사용자 앱 레코드 배열
 * @returns         built-in 앱 앞, 사용자 앱 뒤 순서의 DesktopAppEntry 배열
 *
 * - 아이콘 위치는 built-in 아이콘 아래에 100px 간격으로 자동 배치
 * - user 앱의 contentUrl은 미사용 (htmlContent를 srcdoc으로 전달)
 * - 카테고리: 'demo' 기본값 (manifest에 카테고리 필드 없으므로)
 */
export function buildCatalog(
  userApps: ReadonlyArray<UserAppRecord>,
): ReadonlyArray<DesktopAppEntry> {
  /** built-in 앱 중 아이콘 위치가 지정된 마지막 y 좌표 */
  const lastBuiltInY =
    DESKTOP_APPS.reduce<number>((maxY, app) => {
      const y = app.iconPosition?.y ?? 0;
      return y > maxY ? y : maxY;
    }, 0);

  const userEntries: ReadonlyArray<DesktopAppEntry> = userApps.map(
    (u, idx): DesktopAppEntry => ({
      id: u.manifest.id,
      name: u.manifest.name,
      icon: { kind: 'emoji', char: '📦' },
      source: 'user',
      manifest: u.manifest,
      htmlContent: u.htmlContent,
      // built-in 앱 마지막 y 아래에 100px 간격으로 배치
      iconPosition: { x: 30, y: lastBuiltInY + 100 + idx * 100 },
      windowDefaults: {
        position: { x: 100, y: 100 },
        size: {
          width: u.manifest.size.defaultWidth,
          height: u.manifest.size.defaultHeight,
        },
      },
      description: u.manifest.description,
      longDescription: u.manifest.description,
      category: 'demo',
      author: u.manifest.author,
      version: u.manifest.version,
    }),
  );

  return [...DESKTOP_APPS, ...userEntries];
}
