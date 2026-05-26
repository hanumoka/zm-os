// 순수 타입 모듈 — 'use client' 불필요 (런타임 코드 없음).
// 서버 컴포넌트에서 `import type { ... }` 로 안전하게 가져갈 수 있도록 한다.

// ─── WindowVisualState ────────────────────────────────────────────────────────

export type WindowVisualState = 'open' | 'minimized' | 'maximized';

// ─── WindowContentId ──────────────────────────────────────────────────────────

export type WindowContentId = string;

// ─── WindowControls ───────────────────────────────────────────────────────────

/**
 * 윈도우 컨트롤 이벤트 핸들러 묶음.
 * <Window> 컴포넌트의 타이틀바 버튼에서 호출된다.
 */
export type WindowControls = {
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
  onRestore?: () => void;
  onFocus?: () => void;
};

// ─── WindowGeometryChange ─────────────────────────────────────────────────────

/**
 * 드래그/리사이즈 완료 후 호출되는 콜백.
 * controlled 모드에서 부모가 position/size를 업데이트한다.
 */
export type WindowGeometryChange = {
  onMove?: (x: number, y: number) => void;
  onResize?: (width: number, height: number, x: number, y: number) => void;
};

// ─── WindowProps ──────────────────────────────────────────────────────────────

/**
 * <Window> 컴포넌트 Props.
 *
 * - position/size 가 제공되면 controlled 모드 (react-rnd position + size prop).
 * - 미제공이면 uncontrolled 모드 (react-rnd default prop).
 * - initialPosition/initialSize 는 uncontrolled 모드 초기값.
 */
export type WindowProps = {
  /** 윈도우 고유 ID */
  id: string;
  /** 타이틀바에 표시되는 윈도우 제목 */
  title: string;
  /** uncontrolled 모드 초기 위치 (px) */
  initialPosition?: { x: number; y: number };
  /** uncontrolled 모드 초기 크기 (px) */
  initialSize?: { width: number; height: number };
  /** controlled 모드 위치 (px) — 제공 시 controlled */
  position?: { x: number; y: number };
  /** controlled 모드 크기 (px) — 제공 시 controlled */
  size?: { width: number; height: number };
  /** 최소 크기 (px) */
  minSize?: { width: number; height: number };
  /** 최대 크기 (px) */
  maxSize?: { width: number; height: number };
  /** 리사이즈 가능 여부 (기본값: true) */
  resizable?: boolean;
  /** 드래그 가능 여부 (기본값: true) */
  draggable?: boolean;
  /**
   * 드래그 경계 selector 또는 'parent'.
   * react-rnd bounds prop에 그대로 전달된다.
   */
  bounds?: string | Element;
  /** 가로세로 비율 고정 여부 */
  lockAspectRatio?: boolean | number;
  /** 윈도우 시각적 상태 */
  state?: WindowVisualState;
  /** z-index */
  zIndex?: number;
  /** 컨트롤 이벤트 핸들러 */
  controls?: WindowControls;
  /** 드래그/리사이즈 완료 콜백 */
  geometry?: WindowGeometryChange;
  /** 윈도우 콘텐츠 */
  children?: React.ReactNode;
  /** 윈도우 최외각 div의 추가 className */
  className?: string;
  /** 타이틀바 div의 추가 className */
  titleBarClassName?: string;
  /** 스크린 리더용 라벨 */
  ariaLabel?: string;
};

// ─── WindowState ──────────────────────────────────────────────────────────────

/**
 * WindowManager가 관리하는 단일 윈도우 상태.
 */
export type WindowState = {
  id: string;
  title: string;
  contentId: WindowContentId;
  state: WindowVisualState;
  zIndex: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
};

// ─── WindowOpenInit ───────────────────────────────────────────────────────────

/**
 * manager.open() 호출 시 전달하는 초기화 파라미터.
 */
export type WindowOpenInit = {
  id: string;
  title: string;
  contentId: WindowContentId;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
};

// ─── WindowManager ────────────────────────────────────────────────────────────

/**
 * useWindowManager() 훅이 반환하는 공개 인터페이스.
 * §3.2 시그니처 그대로 — 변경 금지.
 */
export type WindowManager = {
  windows: WindowState[];
  open: (init: WindowOpenInit) => void;
  close: (id: string) => void;
  minimize: (id: string) => void;
  maximize: (id: string) => void;
  restore: (id: string) => void;
  focus: (id: string) => void;
  setPosition: (id: string, x: number, y: number) => void;
  setSize: (id: string, width: number, height: number) => void;
};
