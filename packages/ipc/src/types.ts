/**
 * IPC 타입 정의 — 호스트-앱 통신 표면
 *
 * @module ipc/types
 */

// ─── 상태 코드 ────────────────────────────────────────────────────────────────

/** IPC 연결 상태 */
export type IpcStatus = 'idle' | 'connecting' | 'ready' | 'closed' | 'error';

/** IPC 에러 코드 */
export type IpcErrorCode =
  | 'timeout'
  | 'peer_down'
  | 'denied'
  | 'invalid_origin'
  | 'protocol'
  | 'rate_limited'
  | 'unknown';

// ─── 에러 클래스 ──────────────────────────────────────────────────────────────

/** IPC 에러 */
export class IpcError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
  }
}

// ─── 권한 ─────────────────────────────────────────────────────────────────────

/** 호스트가 앱에게 허용하는 메서드 권한 목록 (v1: 화이트리스트) */
export interface IpcPermissionGrant {
  readonly allowedMethods: ReadonlyArray<string>;
}

// ─── API 표면 ─────────────────────────────────────────────────────────────────

/**
 * 앱(iframe) 측에서 호스트로 노출하는 API.
 * Record 값은 임의 인자를 받고 Promise 또는 값을 반환하는 함수.
 */
export type AppApi = Record<string, (...args: unknown[]) => unknown>;

/**
 * 호스트가 앱(iframe)으로 노출하는 API.
 * Record 값은 임의 인자를 받고 Promise 또는 값을 반환하는 함수.
 */
export type HostApi = Record<string, (...args: unknown[]) => unknown>;

// ─── 호스트 엔드포인트 ────────────────────────────────────────────────────────

/** 호스트 측 IPC 핸들 */
export interface HostEndpoint {
  /** 현재 연결 상태 */
  readonly status: IpcStatus;

  /**
   * 앱(iframe)의 메서드를 RPC 호출한다.
   * @param method 앱이 expose한 메서드 이름
   * @param args 전달할 인자 배열
   * @param timeoutMs 개별 호출 타임아웃 (ms). 미지정 시 defaultTimeoutMs 사용.
   */
  call(method: string, args?: unknown[], timeoutMs?: number): Promise<unknown>;

  /** IPC 연결을 닫고 리소스를 해제한다. */
  close(): void;
}

// ─── 앱 클라이언트 (srcdoc 내부 런타임용) ────────────────────────────────────

/** 앱(iframe) 측 IPC 클라이언트 (connectToHost 반환값) */
export interface AppClient {
  /** 현재 연결 상태 */
  readonly status: IpcStatus;

  /**
   * 앱 측 메서드를 호스트에게 노출한다.
   * @param api 노출할 메서드 맵
   */
  expose(api: AppApi): void;

  /** IPC 연결을 닫는다. */
  close(): void;
}

// ─── 옵션 ─────────────────────────────────────────────────────────────────────

/** createHostEndpoint 옵션 */
export interface HostEndpointOptions {
  /** 통신 대상 iframe 엘리먼트 */
  iframe: HTMLIFrameElement;
  /**
   * 앱이 호출할 수 있는 메서드 화이트리스트 (v1 권한 모델).
   * undefined이면 모든 메서드 거부.
   */
  allowedMethods: ReadonlyArray<string>;
  /**
   * RPC 호출 기본 타임아웃 (ms). 기본값: 5000
   */
  defaultTimeoutMs?: number;
  /**
   * 호스트에서 앱으로 노출할 API (앱이 RPC 호출 가능).
   * 미지정 시 빈 API.
   */
  expose?: HostApi;
  /**
   * (ADR-0034, F0 seam) capability 강제 미들웨어.
   * CALL 수신 시 allowedMethods 통과 후 추가 검증한다. `false` 반환 시 'denied' 응답.
   * 미지정 시 검증 생략 → allowedMethods-only 동작(현행과 byte-identical). F1 broker가 주입.
   */
  authorize?: (method: string, args: ReadonlyArray<unknown>) => boolean;
  /**
   * 앱→호스트 메시지 rate limit 설정 (N-08 DoS 방어).
   * 미지정 시 기본값: { maxMessages: 60, windowMs: 1000, penaltyMs: 2000 }
   * false로 설정 시 rate limit 비활성화.
   */
  rateLimit?: Partial<import('./rate-limiter').RateLimitConfig> | false;
  /**
   * Rate limit 초과 시 호출되는 콜백.
   * UI 알림/앱 강제 종료 등 호출자가 결정.
   */
  onRateLimitExceeded?: (status: import('./rate-limiter').RateLimitStatus) => void;
}

/** connectToHost 옵션 (앱 측 런타임에서 사용) */
export interface AppClientOptions {
  /**
   * 핸드셰이크 타임아웃 (ms). 기본값: 5000
   */
  handshakeTimeoutMs?: number;
}
